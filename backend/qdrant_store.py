# backend/qdrant_store.py

from __future__ import annotations
from typing import List, Optional, Dict, Any
import hashlib
import uuid

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)

import os
from dotenv import load_dotenv

import logging

from typing import Optional
import threading

load_dotenv()

logger = logging.getLogger(__name__)


# ✅ Lazy model load — not loaded at import time, only on first call
# Prevents slowing down server startup
_embedding_model = None
_model_lock = threading.Lock()  # thread-safe lazy init


def _get_embedding_model():
    """
    Lazy init for the embedding model.
    Thread-safe — can be called from multiple FastAPI workers.
    """
    global _embedding_model

    if _embedding_model is not None:
        return _embedding_model

    with _model_lock:
        # Double-check inside the lock
        if _embedding_model is not None:
            return _embedding_model

        model_name = os.getenv(
            "FFT_EMBEDDING_MODEL",
            "paraphrase-multilingual-MiniLM-L12-v2"
        )

        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model: %s ...", model_name)
            _embedding_model = SentenceTransformer(model_name)
            logger.info("Embedding model loaded: %s", model_name)
        except ImportError:
            logger.error(
                "sentence-transformers is not installed. "
                "Install: pip install sentence-transformers"
            )
            _embedding_model = None
        except Exception as exc:
            logger.error("Error loading embedding model: %s", exc)
            _embedding_model = None

    return _embedding_model


# ====== CONFIG ======

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "fft_events")

# Pseudo-embedding placeholder — set to 0 to use real sentence-transformers
FFT_USE_PSEUDO_EMBEDDING = 1

# Fixed vector size — must match the embedding model output dimension
QDRANT_VECTOR_SIZE = int(os.getenv("QDRANT_VECTOR_SIZE", "128"))

# Global client (one client per process)
_qdrant: Optional[QdrantClient] = None


def get_qdrant_client() -> Optional[QdrantClient]:
    """
    Lazy init for the Qdrant client and collection.
    Returns None if Qdrant is not available — does not crash.
    """
    global _qdrant
    if _qdrant is not None:
        return _qdrant

    try:
        _qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        _ensure_collection(_qdrant)
        logger.info(
            "Qdrant client initialised: %s:%s collection=%s",
            QDRANT_HOST, QDRANT_PORT, QDRANT_COLLECTION,
        )
        return _qdrant

    except Exception as exc:
        # ✅ Does not crash — returns None and logs the error
        # All callers of get_qdrant_client() must check for None before use
        logger.error(
            "Qdrant connection failed (%s:%s): %s",
            QDRANT_HOST, QDRANT_PORT, exc,
        )
        _qdrant = None
        return None


def _ensure_collection(client: QdrantClient) -> None:
    """
    Create collection if it does not exist. Does not delete existing ones.
    """
    cols = client.get_collections()
    if any(c.name == QDRANT_COLLECTION for c in cols.collections):
        print(f"[QDRANT] Collection '{QDRANT_COLLECTION}' already exists.")
        return

    client.create_collection(
        collection_name=QDRANT_COLLECTION,
        vectors_config=VectorParams(
            size=QDRANT_VECTOR_SIZE,
            distance=Distance.COSINE,
        ),
    )
    print(f"[QDRANT] Collection '{QDRANT_COLLECTION}' created (dim={QDRANT_VECTOR_SIZE}).")


# ====== PSEUDO-EMBEDDING ======

def _pseudo_embed(text: str) -> List[float]:
    """
    Deterministic pseudo-embedding based on SHA-256.
    Used as a fallback when sentence-transformers is not available.
    NOT semantic — for testing Qdrant infrastructure only.
    """
    if not text:
        text = "empty"
    h = hashlib.sha256(text.encode("utf-8")).digest()
    seed = int.from_bytes(h[:8], "big", signed=False)
    rng = np.random.default_rng(seed)
    vec = rng.normal(size=QDRANT_VECTOR_SIZE)
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec.astype(np.float32).tolist()
    vec = vec / norm
    return vec.astype(np.float32).tolist()


def _embed_text(text: str) -> List[float]:
    """
    Generate an embedding vector for the given text.

    If FFT_USE_PSEUDO_EMBEDDING=1 or the model is unavailable:
        → uses deterministic SHA-256 pseudo-embedding (fallback)

    If FFT_USE_PSEUDO_EMBEDDING=0:
        → uses sentence-transformers model (real semantic embedding)
    """
    if not text or not text.strip():
        text = "empty"

    # ✅ Check env variable
    use_pseudo = bool(int(os.getenv("FFT_USE_PSEUDO_EMBEDDING", "1")))

    if use_pseudo:
        return _pseudo_embed(text)

    # ✅ Attempt real embedding
    model = _get_embedding_model()

    if model is None:
        logger.warning(
            "Embedding model not available, using pseudo-embedding fallback."
        )
        return _pseudo_embed(text)

    try:
        embedding = model.encode(
            text,
            normalize_embeddings=True,  # ✅ L2 normalisation for COSINE distance
            show_progress_bar=False,
        )
        vec = embedding.astype(np.float32).tolist()

        # ✅ Check dimension
        if len(vec) != QDRANT_VECTOR_SIZE:
            logger.error(
                "Embedding dimension %d != QDRANT_VECTOR_SIZE %d. "
                "Update QDRANT_VECTOR_SIZE in .env to %d.",
                len(vec), QDRANT_VECTOR_SIZE, len(vec)
            )
            # Fall back to pseudo to avoid breaking the system
            return _pseudo_embed(text)

        return vec

    except Exception as exc:
        logger.error("Error during embedding: %s", exc)
        return _pseudo_embed(text)


def _build_event_text(event: Dict[str, Any]) -> str:
    """
    Build semantically rich text for embedding.

    Order matters — more important terms go first
    because models give higher weight to the beginning of the sequence.
    """
    parts: List[str] = []

    # ✅ 1) Event description — most important semantic signal
    description = event.get("description")
    if description and isinstance(description, str) and description.strip():
        parts.append(description.strip())

    # 2) Event type
    kind = event.get("kind")
    if isinstance(kind, str) and kind.strip():
        parts.append(kind.strip())

    # 3) Tags
    tags = event.get("topic_tags") or []
    if isinstance(tags, list):
        clean_tags = [str(t).strip() for t in tags if t]
        if clean_tags:
            parts.append(" ".join(clean_tags))

    # 4) Contextual signals (lower semantic weight)
    qid = event.get("quadrant_id")
    if qid:
        parts.append(f"quadrant {qid}")

    route_id = event.get("route_id")
    if route_id:
        parts.append(f"route {route_id}")

    vehicle_id = event.get("vehicle_id")
    if vehicle_id:
        parts.append(f"vehicle {vehicle_id}")

    # ✅ Fallback if everything is empty
    if not parts:
        return "unknown event"

    return " ".join(parts)


# ====== PUBLIC API FOR BACKEND ======

def _qdrant_point_id(event: Dict[str, Any]) -> str:
    eid = str(event.get("event_id") or "").strip()
    if not eid:
        eid = f"{event.get('quadrant_id','')}|{event.get('timestamp','0')}|{event.get('kind','')}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"fft:event:{eid}"))


def index_event(event: Dict[str, Any]) -> None:
    client = get_qdrant_client()
    if client is None:
        # ✅ get_qdrant_client() already logs the error — just exit here
        return

    try:
        # 2) Build text and embedding
        text = _build_event_text(event)
        vector = _embed_text(text)

        # ✅ Single dimension check — using logger instead of print
        if len(vector) != QDRANT_VECTOR_SIZE:
            logger.warning(
                "Vector dimension mismatch: got %d, expected %d. "
                "Skipping index_event for event_id=%s",
                len(vector),
                QDRANT_VECTOR_SIZE,
                event.get("event_id"),
            )
            return

        # 3) Point ID — UUID for Qdrant compatibility
        point_id = _qdrant_point_id(event)

        # 4) Payload
        # ✅ CANONICAL QDRANT PAYLOAD
        payload = {
            # Core fields
            "event_id": event.get("event_id"),
            "quadrant_id": event.get("quadrant_id"),
            "kind": event.get("kind"),
            "timestamp": event.get("timestamp"),
            "topic_tags": event.get("topic_tags") or [],
            "description": event.get("description"),

            # Stake & trust
            "trust_score": event.get("trust_score"),
            "stake": event.get("stake"),

            # Reputation — CANONICAL NAMES
            "ui_reputation": event.get("ui_reputation"),
            "onchain_reputation": event.get("onchain_reputation"),
            "combined_reputation": event.get("combined_reputation"),
            "bonus_local": event.get("bonus_local"),
            "cluster_bonus": event.get("cluster_bonus"),

            # Legacy alias — kept for backward compatibility
            "source_reputation": event.get("combined_reputation"),

            # Source
            "source_wallet": event.get("source_wallet"),

            # Transport domain
            "route_id": event.get("route_id"),
            "vehicle_id": event.get("vehicle_id"),
            "delay_minutes": event.get("delay_minutes"),
            "severity": event.get("severity"),

            # Geo subcell
            "subcell_id": event.get("subcell_id"),
            "h3_resolution": event.get("h3_resolution"),
        }

        # 5) Upsert into Qdrant
        client.upsert(
            collection_name=QDRANT_COLLECTION,
            points=[
                {
                    "id": point_id,
                    "vector": vector,
                    "payload": payload,
                }
            ],
        )

        print(
            f"[QDRANT] Indexed event {point_id}, len_vec={len(vector)}, "
            f"kind={payload.get('kind')}"
        )

    except Exception as exc:
        print(f"[QDRANT] Error in index_event: {exc}")


def semantic_search(
    query: str,
    top_k: int = 10,
    quadrant_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return the closest events for a given text query.
    Returns an empty list if Qdrant is not available.
    """
    # ✅ Check client before anything else
    client = get_qdrant_client()
    if client is None:
        logger.warning(
            "semantic_search: Qdrant not available, returning []."
        )
        return []

    try:
        vector = _embed_text(query)

        q_filter = None
        if quadrant_id:
            q_filter = Filter(
                must=[
                    FieldCondition(
                        key="quadrant_id",
                        match=MatchValue(value=quadrant_id),
                    )
                ]
            )

        result = client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=vector,
            limit=top_k,
            query_filter=q_filter,
            with_payload=True,
            with_vectors=False,
        )

        hits: List[Dict[str, Any]] = []
        for p in result.points:
            pl = p.payload or {}
            hits.append(
                {
                    "event_id": pl.get("event_id"),
                    "quadrant_id": pl.get("quadrant_id"),
                    "kind": pl.get("kind"),
                    "timestamp": pl.get("timestamp"),
                    "topic_tags": pl.get("topic_tags") or [],
                    "trust_score": pl.get("trust_score"),
                    "stake": pl.get("stake"),
                    "source_reputation": pl.get("source_reputation"),
                    "source_wallet": pl.get("source_wallet"),
                    "route_id": pl.get("route_id"),
                    "vehicle_id": pl.get("vehicle_id"),
                    "score": float(p.score or 0.0),
                }
            )
        return hits

    except Exception as exc:
        # ✅ Catches Qdrant errors — does not crash the endpoint
        logger.error("semantic_search error: %s", exc)

        # ✅ Reset client so the next call attempts a reconnect
        global _qdrant
        _qdrant = None

        return []


def semantic_search_similar_events(
    event: Dict[str, Any],
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """
    Wrapper around semantic_search() for anti-cluster analysis.
    Returns an empty list if Qdrant is not available.
    """
    # ✅ No need to check get_qdrant_client() here —
    # semantic_search() handles that internally
    query_text = _build_event_text(event)
    quad_id = event.get("quadrant_id")

    return semantic_search(
        query=query_text,
        top_k=top_k,
        quadrant_id=quad_id,
    )
