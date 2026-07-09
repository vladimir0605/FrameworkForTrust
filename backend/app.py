import os
from typing import Optional, List, Dict, Any, Literal, Tuple
from datetime import datetime, timedelta
import re
import numpy as np
from pydantic import BaseModel, Field
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Request, status, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel, Field, ConfigDict
from collections import defaultdict
import math
import h3

from dotenv import load_dotenv
load_dotenv() #load .env

from web3 import Web3
from db import (
    insert_event, get_quadrant_stats, init_db_pool, list_events_paginated, get_event_quadrant,
    update_event_moderation, get_or_create_user_by_wallet, get_user_roles_for_wallet, get_quadrant_permissions_for_wallet,
    update_quadrant_meta, get_permissions_for_wallet, insert_gcd_ledger_entry,
    get_event_basic_info, get_gcd_balance as db_get_gcd_balance, get_gcd_event_rewards_today,
    get_gcd_event_rewards_today as db_get_gcd_event_rewards_today, get_gcd_event_reward_and_slash,
    get_quadrant_meta, get_events_today_for_wallet, get_event_proof, auth_create_nonce, auth_get_valid_nonce, auth_mark_nonce_used,
    list_quadrants_minted, get_quadrants_indexer_state, set_quadrants_indexer_state, upsert_quadrant_minted,
)

from qdrant_store import ( index_event, semantic_search as qdrant_semantic_search, semantic_search_similar_events, get_qdrant_client )
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

from geo_grid import ( index_location, quadrant_id_from_latlon, subcell_id_from_latlon, GeoIndex, subcell_center_latlon,
                        GRID_LAT_STEP_DEG, GRID_LON_STEP_DEG, DEFAULT_H3_RESOLUTION,
                        )

from eth_account import Account
from eth_account.messages import encode_defunct

from anchor import anchor_cid_onchain

import hashlib
import json
from time import time
import httpx

import secrets
import jwt
import asyncio

from collections import deque

import logging

from web3.middleware import ExtraDataToPOAMiddleware

# ✅ Configure logging for the entire application
logging.basicConfig(
    level=logging.INFO,  # will be overridden by an env variable in production
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ✅ One logger for the whole file
logger = logging.getLogger("fft.app")

# ✅ Set the level from an env variable
# In .env: LOG_LEVEL=WARNING for production, LOG_LEVEL=DEBUG for development
_log_level = os.getenv("LOG_LEVEL", "DEBUG").upper()
logging.getLogger("fft").setLevel(
    getattr(logging, _log_level, logging.DEBUG)
)

#TEMPORARY - for Testing
#fft_jwt_pinata2 = os.getenv("FFT_JWT_PINATA")
#FFT_AUTH_JWT_SECRET = fft_jwt_pinata2

#Test if it is visible
#print("DB_PASSWORD is ",os.getenv("DB_PASSWORD"))
#print("JWT Pinata is ",os.getenv("FFT_JWT_PINATA"))
#print("origins is ",os.getenv("origins"))

# Authorisation of user
AUTH_NONCE_TTL_SEC = 300 # 5 min
bearer_scheme = HTTPBearer(auto_error=False)

# === GCD / web3 configuration ===
AMOY_RPC_URL = os.getenv(
    "AMOY_RPC_URL",
    #"https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY_HERE"  # prilagodi ili prebaci u .env
    #"https://rpc-amoy.polygon.technology/v2/0x36be1c6a0360737ff8c64d2c66685ac1d25726b3"  # prilagodi ili prebaci u .env
    "https://rpc-amoy.polygon.technology"  # prilagodi ili prebaci u .env
)

GCD_CONTRACT_ADDRESS = os.getenv(
    "GCD_CONTRACT_ADDRESS",
    # set the GeoChainData address on Amoy in .env
)

# ERC20 ABI 
GCD_ERC20_ABI = [
    {
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
    # ✅ reward() — poziva backend sa MINTER_ROLE
    {
        "inputs": [
            {"name": "to",     "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "reward",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    # ✅ burn() — poziva backend sa BURN_ROLE (slash on-chain)
    {
        "inputs": [
            {"name": "from",   "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "burn",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


# ✅ Backend wallet — signs on-chain transactions
BACKEND_WALLET_ADDRESS = os.getenv("BACKEND_WALLET_ADDRESS", "").strip()
BACKEND_WALLET_PRIVATE_KEY = os.getenv("BACKEND_WALLET_PRIVATE_KEY", "").strip()


def reward_onchain(to_address: str, amount_gcd: float) -> bool:
    """
    Poziva GeoChainData.reward(to, amount) on-chain.
    Backend wallet mora imati MINTER_ROLE.

    amount_gcd is in GCD units (e.g. 2.5 GCD).
    Konverzija: amount_wei = int(amount_gcd * 10**GCD_DECIMALS)

    Returns True if the transaction succeeds, False otherwise.
    Deliberately does not raise an exception — the error is logged but does not break the ingest flow.
    """
    if not w3 or not gcd_contract:
        logger.warning("reward_onchain: web3 not initialized, skipping.")
        return False

    if not BACKEND_WALLET_ADDRESS or not BACKEND_WALLET_PRIVATE_KEY:
        logger.warning("reward_onchain: BACKEND_WALLET not configured in .env, skipping.")
        return False

    if not to_address or not Web3.is_address(to_address):
        logger.warning("reward_onchain: invalid address %s, skipping.", to_address)
        return False

    if amount_gcd <= 0:
        logger.warning("reward_onchain: amount_gcd <= 0 (%s), skipping.", amount_gcd)
        return False

    try:
        checksum_to      = Web3.to_checksum_address(to_address)
        checksum_backend = Web3.to_checksum_address(BACKEND_WALLET_ADDRESS)

        # Convert GCD → wei
        amount_wei = int(amount_gcd * (10 ** GCD_DECIMALS))

        # Nonce for the backend wallet
        nonce = w3.eth.get_transaction_count(checksum_backend)

        # Izgradi transakciju
        tx = gcd_contract.functions.reward(
            checksum_to,
            amount_wei,
        ).build_transaction({
            "from":     checksum_backend,
            "nonce":    nonce,
            "gas":      120_000,
            "gasPrice": w3.eth.gas_price,
        })

        # Sign and send
        signed = w3.eth.account.sign_transaction(tx, BACKEND_WALLET_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

        # Wait for confirmation (max 60 seconds)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt.status == 1:
            logger.info(
                "reward_onchain: ✅ %s +%.4f GCD | tx=%s",
                to_address, amount_gcd, tx_hash.hex()
            )
            return True
        else:
            logger.error(
                "reward_onchain: ❌ TX reverted for %s | tx=%s",
                to_address, tx_hash.hex()
            )
            return False

    except Exception as exc:
        logger.error("reward_onchain: error for %s amount=%.4f: %s",
                     to_address, amount_gcd, exc)
        return False


def slash_onchain(from_address: str, amount_gcd: float) -> bool:
    """
    Poziva GeoChainData.burn(from, amount) on-chain.
    Backend wallet mora imati BURN_ROLE.

    amount_gcd is in GCD units (e.g. 1.0 GCD).
    Konverzija: amount_wei = int(amount_gcd * 10**GCD_DECIMALS)

    Returns True if the transaction succeeds, False otherwise.
    Deliberately does not raise an exception — the error is logged but does not break the moderation flow.
    """
    if not w3 or not gcd_contract:
        logger.warning("slash_onchain: web3 not initialized, skipping.")
        return False

    if not BACKEND_WALLET_ADDRESS or not BACKEND_WALLET_PRIVATE_KEY:
        logger.warning("slash_onchain: BACKEND_WALLET not configured in .env, skipping.")
        return False

    if not from_address or not Web3.is_address(from_address):
        logger.warning("slash_onchain: invalid address %s, skipping.", from_address)
        return False

    if amount_gcd <= 0:
        logger.warning("slash_onchain: amount_gcd <= 0 (%s), skipping.", amount_gcd)
        return False

    try:
        checksum_from    = Web3.to_checksum_address(from_address)
        checksum_backend = Web3.to_checksum_address(BACKEND_WALLET_ADDRESS)

        # Convert GCD → wei
        amount_wei = int(amount_gcd * (10 ** GCD_DECIMALS))

        # Nonce for the backend wallet
        nonce = w3.eth.get_transaction_count(checksum_backend)

        # Izgradi transakciju
        tx = gcd_contract.functions.burn(
            checksum_from,
            amount_wei,
        ).build_transaction({
            "from":     checksum_backend,
            "nonce":    nonce,
            "gas":      120_000,
            "gasPrice": w3.eth.gas_price,
        })

        # Sign and send
        signed = w3.eth.account.sign_transaction(tx, BACKEND_WALLET_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

        # Wait for confirmation (max 60 seconds)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt.status == 1:
            logger.info(
                "slash_onchain: ✅ %s -%.4f GCD (burned) | tx=%s",
                from_address, amount_gcd, tx_hash.hex()
            )
            return True
        else:
            logger.error(
                "slash_onchain: ❌ TX reverted for %s | tx=%s",
                from_address, tx_hash.hex()
            )
            return False

    except Exception as exc:
        logger.error("slash_onchain: error for %s amount=%.4f: %s",
                     from_address, amount_gcd, exc)
        return False




# Simple in-memory backend "store" (max 5000 events in memory)
#EVENT_STORE: list[dict] = []
EVENT_STORE: deque = deque(maxlen=5000)

STAKE_REF = 100.0  # reference stake, for testing (e.g. 100 GCD = max effect)
GCD_REP_REF = 1000.0  # e.g. 1000 GCD => reputation 1.0

# === DB konstante ===
#DB_HOST = "localhost"
#DB_PORT= 3306
#DB_USER = "root"
#DB_PASSWORD = ""
#DB_NAME = "fft_db"

DEBUG_TRUST = True

# Canonical constants for role codes
ROLE_USER = "user"
ROLE_QUADRANT_EDITOR = "quadrant_editor"
ROLE_PARTNER = "partner"
ROLE_ADMIN = "admin"
ROLE_ORACLE = "oracle"

# How many events per day are allowed per wallet address
MAX_EVENTS_PER_WALLET_PER_DAY = 80

# === GCD ekonomija: osnovni parametri (v0 parametri) ===

# Max GCD awarded for a single "perfect" event (trust_score ~ 1.0)
GCD_EVENT_REWARD_BASE = 5.0  # 1 GCD per event at trust_score=1

# Bonus component based on stake
GCD_EVENT_STAKE_FACTOR = 0.03   # e.g. 0.1 GCD bonus per 1 staked GCD
GCD_EVENT_STAKE_BONUS_CAP = 3.0  # max bonus po eventu


# How strictly we penalize spam/fake events
GCD_SLASH_PENALTY_MULTIPLIER = 1.5   # kazna ≈ 1.5x nagrade
GCD_SLASH_STAKE_FRACTION = 0.5       # max 50% prijavljenog stake-a
GCD_SLASH_MAX = 100.0                # hard cap per event (for v0)

# Daily GCD reward limit per wallet (event_reward event_type)
GCD_DAILY_EVENT_REWARD_CAP = 30.0

# === GCD anti-farming (soft limiter) ===
# After this many events in a day, reward "fatigue" kicks in
GCD_DAILY_EVENTS_SOFT_CAP = 10        # prvih 10 eventa pun gas
# How much we reduce the reward per event after the soft cap (linearly)
GCD_DAILY_DECAY_PER_EXTRA_EVENT = 0.1  # svaki extra event -10% nagrade
# Lower bound of the multiplier (so it doesn't drop below e.g. 20% of the raw reward)
GCD_DAILY_MIN_REWARD_FACTOR = 0.2

#H3 resolution used in geo_grid.index_location
#DEFAULT_H3_RESOLUTION = 13

#JWT user authorization
FFT_AUTH_JWT_SECRET = os.getenv("FFT_AUTH_JWT_SECRET", "").strip()
FFT_AUTH_JWT_TTL_SEC = int(os.getenv("FFT_AUTH_JWT_TTL_SEC", "86400"))
FFT_AUTH_DOMAIN = os.getenv("FFT_AUTH_DOMAIN", "fft").strip()

if not FFT_AUTH_JWT_SECRET:
    #print("[AUTH WARN] FFT_AUTH_JWT_SECRET not set! Auth login wouldn't work.")
    logger.critical("FFT_AUTH_JWT_SECRET not set! Auth login will not work.")


# === Quadrants indexer config ===
QUADRANTS_ADDRESS = os.getenv("QUADRANTS_ADDRESS", "").strip()
QUADRANTS_DEPLOY_FROM_BLOCK = int(os.getenv("QUADRANTS_DEPLOY_FROM_BLOCK", "0"))

# adaptive step tuning
FFT_QIDX_STEP_START = int(os.getenv("FFT_QIDX_STEP_START", "2000"))
FFT_QIDX_STEP_MIN = int(os.getenv("FFT_QIDX_STEP_MIN", "200"))
FFT_QIDX_STEP_MAX = int(os.getenv("FFT_QIDX_STEP_MAX", "50000"))

TRANSFER_TOPIC0 = Web3.keccak(text="Transfer(address,address,uint256)").hex()

def _require_admin_key(admin_key: Optional[str]) -> None:
    # If you haven't set the key in env, skip it (dev-friendly)
    if not FFT_ADMIN_API_KEY:
        return
    if not admin_key or admin_key.strip() != FFT_ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Nevalidan X-FFT-Admin-Key.")




# --- helper: extract the H3 resolution from subcell_id if it is H3 ---
_H3_SUBCELL_RE = re.compile(r"^H3R(\d+):")
def _h3_res_from_subcell_id(subcell_id: Optional[str]) -> Optional[int]:
    if not subcell_id:
        return None
    m = _H3_SUBCELL_RE.match(subcell_id.strip())
    if not m:
        return None
    try:
        return int(m.group(1))
    except Exception:
        return None


w3: Optional[Web3] = None
gcd_contract = None
GCD_DECIMALS = 18

def init_web3():
    global w3, gcd_contract, GCD_DECIMALS
    #global gcd_contract, GCD_DECIMALS

    try:
        w3 = Web3(Web3.HTTPProvider(AMOY_RPC_URL))
        if not w3.is_connected():
            #print("[DEBUG W3] connected = False")
            logger.warning("Web3 RPC not connected.")
            w3 = None
            gcd_contract = None
            return

        addr = (GCD_CONTRACT_ADDRESS or "").strip().strip('"').strip("'")
        if not Web3.is_address(addr):
            #print(f"[GCD] Nevalidan GCD_CONTRACT_ADDRESS: {addr!r}")
            logger.warning("Invalid GCD_CONTRACT_ADDRESS: %r", addr)
            gcd_contract = None
            return

        gcd_contract = w3.eth.contract(
            address=Web3.to_checksum_address(addr),
            abi=GCD_ERC20_ABI,
        )
        GCD_DECIMALS = gcd_contract.functions.decimals().call()
        #print(f"[GCD] Web3 povezan, decimals={GCD_DECIMALS}, contract={addr}")
        logger.info("Web3 connected, decimals=%s, contract=%s", GCD_DECIMALS, addr)
    except Exception as e:
        #print(f"[GCD] Error initializing web3/GCD: {e}")
        logger.error("Web3/GCD init error: %s", e)
        w3 = None
        gcd_contract = None

# -------------------------
# FastAPI + CORS
# -------------------------

# Application create
app = FastAPI(
    title="Framework for Trust – Event API",
    description="test server",
    version="0.1.0",
)

# In production, only the main site + admin panel domain
origins = [
    "http://localhost:3000",
    "http://10.198.3.166:3000",  # prilagodi pred produkciju
]

init_web3()

def get_request_wallet(request: Request) -> Optional[str]:
    """
    Extracts the wallet address from the HTTP request.

    Prioritet:
      1) HTTP header: X-Wallet-Address (ili varijante)
      2) Query param: ?wallet=... ili ?wallet_address=...
    """

    # 1) Header variants (case-insensitive mapping, but explicitly covering the names)
    for key in ["x-wallet-address", "X-Wallet-Address", "x-wallet", "X-Wallet"]:
        if key in request.headers:
            raw = request.headers.get(key)
            if raw:
                addr = raw.strip()
                if addr:
                    return addr

    # 2) Query parametri
    qp = request.query_params
    raw = qp.get("wallet") or qp.get("wallet_address")
    if raw:
        addr = raw.strip()
        if addr:
            return addr

    # 3) There is nothing
    return None

# Double function
'''
async def get_current_identity(
    request: Request,
    wallet_header: Optional[str] = Header(
        default=None,
        alias="X-Wallet-Address",
        description="Ethereum wallet address (MetaMask).",
    ),
) -> Dict[str, Any]:
    """
    Extracts the user identity from the X-Wallet-Address header and the fft_wallet cookie,
    then loads permissions from fft_quadrant_permissions.
    """
    # 1) Wallet from the header takes priority
    wallet = wallet_header
    if not wallet:
        wallet = get_request_wallet(request)  # your existing helper function

    if not wallet:
        # No wallet → guest with no permissions
        return {
            "wallet_address": None,
            "is_system_admin": False,
            "global_permissions": [],
            "quadrant_permissions": {},
            "raw_permissions": [],
        }

    # --- The existing logic stays here: SELECT from fft_quadrant_permissions ---
    perms = get_permissions_for_wallet(wallet)  # or whatever you call the function from db.py

    global_perms = [p["permission"] for p in perms if p["quadrant_id"] == "GLOBAL"]
    is_admin = "system_admin" in global_perms

    quadrant_perms: Dict[str, List[str]] = {}
    for p in perms:
        qid = p["quadrant_id"]
        if qid == "GLOBAL":
            continue
        quadrant_perms.setdefault(qid, []).append(p["permission"])

    return {
        "wallet_address": wallet,
        "is_system_admin": is_admin,
        "global_permissions": global_perms,
        "quadrant_permissions": quadrant_perms,
        "raw_permissions": perms,
    }
'''

def ensure_can_edit_quadrant(identity: Dict[str, Any], quadrant_id: str) -> None:
    """
    Dozvoljeno ako:
      - the user has system_admin (GLOBAL), or
      - the user has quadrant_editor for the given quadrant_id.
    U suprotnom -> 403.
    """
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User identity not found.",
        )

    # 1) System admin has access to all quadrants
    if identity.get("is_system_admin"):
        return

    # 2) Quadrant-specific permission
    q_perms = identity.get("quadrant_permissions") or {}
    perms_for_quad = q_perms.get(quadrant_id, []) or []

    if "quadrant_editor" in perms_for_quad:
        return

    # 3) Missing required permissions
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Insufficient permissions to edit quadrant {quadrant_id}.",
    )


def has_quadrant_permission(
    identity: Dict[str, Any],
    quadrant_id: str,
    permission: str,
) -> bool:
    """
    Returns True if the user has the given permission for the given quadrant.
    Relies on identity["quadrant_permissions"] = { quadrant_id: [perm1, perm2, ...] }.
    """
    q_perms = identity.get("quadrant_permissions") or {}
    perms_for_quad = q_perms.get(quadrant_id) or []
    return permission in perms_for_quad


def ensure_can_moderate_event(identity: Dict[str, Any], quadrant_id: str) -> None:
    """
    Dozvoljeno ako:
      - the user has system_admin (GLOBAL), or
      - the user has quadrant_editor for the given quadrant_id, or
      - the user has event_moderator for the given quadrant_id.
    U suprotnom -> 403.
    """
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User identity not found.",
        )

    # 1) System admin has access to all quadrants
    if identity.get("is_system_admin"):
        return

    # 2) Quadrant editor for that quadrant
    if has_quadrant_permission(identity, quadrant_id, "quadrant_editor"):
        return

    # 3) Event moderator for that quadrant
    if has_quadrant_permission(identity, quadrant_id, "event_moderator"):
        return

    # 4) Missing required permissions
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Insufficient permissions to moderate events in quadrant {quadrant_id}.",
    )


def require_role(required_roles: List[str]):
    """
    Helper that returns a dependency, e.g.:

      @app.get("/admin/...")
      def some_admin_endpoint(identity=Depends(require_role([ROLE_ADMIN]))):
          ...

    If the user doesn't have the required role, raises 403.
    """
    def dependency(identity = Depends(get_current_identity)):
        roles = identity.get("roles") or []
        if not any(r in roles for r in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation.",
            )
        return identity

    return dependency



def compute_onchain_reputation_from_gcd(source_wallet: Optional[str]) -> float:
    """
    Computes reputation [0,1] based on the wallet's GCD balance.
    If there's no wallet or no connection to the blockchain, returns 0.0.
    """
    if not source_wallet:
        return 0.0

    if w3 is None or not w3.is_connected() or gcd_contract is None:
        # no connection or contract -> no server-side penalty, just 0.0
        return 0.0

    try:
        checksum = Web3.to_checksum_address(source_wallet)
        raw_balance = gcd_contract.functions.balanceOf(checksum).call()
        balance = raw_balance / (10 ** GCD_DECIMALS)

        # 0 GCD -> 0, 1000 GCD -> 1.0, anything above is capped at 1.0
        rep = min(balance / GCD_REP_REF, 1.0)
        return float(rep)
    except Exception as e:
        #print(f"[GCD WARN] Failed to compute onchain_rep for {source_wallet}: {e}")
        logger.warning("onchain_rep failed for %s: %s", source_wallet, e)
        return 0.0



app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def reward_event_contributor(stored: Dict[str, Any]) -> None:
    """
    v0.2 logika:
      - base reward ∝ trust_score
      - plus a bonus based on the stake (with a cap)
      - soft anti-farming:
          * after GCD_DAILY_EVENTS_SOFT_CAP events in a day we introduce a decay factor
          * hard cap GCD_DAILY_EVENT_REWARD_CAP po danu po walletu
    """
    wallet = stored.get("source_wallet")
    if not wallet:
        return

    # 1) trust_score
    ts_raw = stored.get("trust_score") or 0.0
    try:
        ts = float(ts_raw)
    except (TypeError, ValueError):
        ts = 0.0

    if ts <= 0.0:
        # completely unreliable event -> no reward
        return

    # 2) stake (for the bonus)
    stake_raw = stored.get("stake") or 0.0
    try:
        stake = float(stake_raw)
    except (TypeError, ValueError):
        stake = 0.0

    # 3) bazni dio i stake bonus
    base_part = GCD_EVENT_REWARD_BASE * ts
    stake_bonus = min(stake * GCD_EVENT_STAKE_FACTOR, GCD_EVENT_STAKE_BONUS_CAP)
    raw_reward = base_part + stake_bonus

    # 4) read how much has already been earned today
    try:
        events_today, total_today = get_gcd_event_rewards_today(wallet)
    except Exception as exc:
        #print(f"[GCD DEBUG] get_gcd_event_rewards_today error: {exc}")
        logger.debug("get_gcd_event_rewards_today error: %s", exc)
        events_today, total_today = 0, 0.0

    # 5) decay after a certain number of events in a day
    over = max(0, events_today - GCD_DAILY_EVENTS_SOFT_CAP)
    if over > 0:
        # linear decrease: 1.0, 0.9, 0.8, ... but not below GCD_DAILY_MIN_REWARD_FACTOR
        decay_factor = max(
            GCD_DAILY_MIN_REWARD_FACTOR,
            1.0 - GCD_DAILY_DECAY_PER_EXTRA_EVENT * over,
        )
    else:
        decay_factor = 1.0

    reward_before_cap = raw_reward * decay_factor

    # 6) hard cap – we use the existing GCD_DAILY_EVENT_REWARD_CAP
    remaining_cap = max(0.0, GCD_DAILY_EVENT_REWARD_CAP - float(total_today))
    if remaining_cap <= 0.0:
        #print(
        #    f"[GCD DEBUG] Daily cap exhausted for {wallet} "
        #    f"(total_today={total_today}, cap={GCD_DAILY_EVENT_REWARD_CAP})"
        #)
        logger.debug("Daily cap exhausted for %s (total_today=%s)", wallet, total_today)
        return

    reward = min(reward_before_cap, remaining_cap)

    if reward <= 0.0:
        #print(
        #    f"[GCD DEBUG] reward_event_contributor: reward<=0 "
        #    f"(raw={raw_reward}, decay={decay_factor}, remaining_cap={remaining_cap})"
        #)
        logger.debug("reward<=0 (raw=%s, decay=%s, remaining_cap=%s)", raw_reward, decay_factor, remaining_cap)
        return

    # 7) upis u gcd_ledger
    insert_gcd_ledger_entry(
        wallet_address=wallet,
        amount=reward,
        entry_type="event_reward",
        event_id=stored.get("event_id"),
        metadata={
            "reason": "event_trust_reward",
            "trust_score": ts,
            "stake": stake,
            "quadrant_id": stored.get("quadrant_id"),

            "base_part": base_part,
            "stake_bonus": stake_bonus,
            "raw_reward": raw_reward,

            "events_today_before": events_today,
            "total_reward_today_before": float(total_today),
            "decay_factor": decay_factor,
            "reward_before_cap": reward_before_cap,
            "daily_cap": GCD_DAILY_EVENT_REWARD_CAP,
            "daily_cap_remaining_before": remaining_cap,
        },
    )
    #print(
    #    f"[GCD] reward_event_contributor: wallet={wallet}, "
    #    f"+{reward:.4f} GCD (ts={ts:.3f}, stake={stake}, "
    #    f"events_today={events_today}, total_today={total_today})"
    #)
    logger.info("Reward: wallet=%s +%.4f GCD (ts=%.3f)", wallet, reward, ts)

    # ✅ On-chain reward — mints a real GCD token on the blockchain
    # If it fails, the off-chain ledger is already written — we don't break the flow
    reward_ok = reward_onchain(wallet, reward)
    if not reward_ok:
        logger.warning(
            "reward_onchain FAILED for %s +%.4f GCD — "
            "off-chain ledger has been written, on-chain has not.",
            wallet, reward
        )



def apply_slash_for_event(
    event_id: str,
    moderation_status: str,
    moderator_wallet: Optional[str] = None,
) -> None:
    """
    Apply a GCD penalty (slash) for the given event, if it's flagged as fake/spam.

    Logika (idempotentna):
      1) We find basic event info (wallet, stake, trust_score...)
      2) From gcd_ledger we read:
           - total_reward  (total event_reward for that event)
           - total_slash   (total slash_penalty for that event)
      3) We compute the target penalty (target_penalty) based on:
           - GCD_SLASH_PENALTY_MULTIPLIER * total_reward
           - GCD_SLASH_STAKE_FRACTION * stake
           - GCD_SLASH_MAX
      4) We apply only the difference (target_penalty - total_slash), if it is > 0
    """

    #print(
        #f"[GCD SLASH] apply_slash_for_event start: event_id={event_id}, "
        #f"status={moderation_status}, moderator={moderator_wallet}"
    #)
    logger.info("Slash start: event=%s status=%s moderator=%s", event_id, moderation_status, moderator_wallet)

    # 1) Osnovne info o eventu
    basic = get_event_basic_info(event_id)
    #print(f"[GCD SLASH] basic info for {event_id}: {basic}")
    logger.debug("Slash basic info for %s: %s", event_id, basic)

    if not basic:
        #print(f"[GCD SLASH] get_event_basic_info({event_id}) returned empty, skipping.")
        logger.warning("Slash: get_event_basic_info(%s) returned empty.", event_id)
        return

    wallet = basic.get("source_wallet")
    if not wallet:
        #print(f"[GCD SLASH] Event {event_id} has no source_wallet, skipping.")
        logger.warning("Slash: event %s has no source_wallet.", event_id)
        return

    stake = basic.get("stake") or 0.0
    try:
        stake = float(stake)
    except (TypeError, ValueError):
        stake = 0.0

    ts = basic.get("trust_score") or 0.0
    try:
        ts = float(ts)
    except (TypeError, ValueError):
        ts = 0.0

    print(f"[GCD SLASH] wallet={wallet}, stake={stake}, trust_score={ts}")
    #logger.debug("Slash: wallet=%s stake=%s trust_score=%s", wallet, stake, ts)

    # 2) reward + existing slash from gcd_ledger
    total_reward, total_slash = get_gcd_event_reward_and_slash(wallet, event_id)
    #print(f"[GCD SLASH] total_reward={total_reward}, total_slash={total_slash}")
    logger.debug("Slash: total_reward=%s total_slash=%s", total_reward, total_slash)

    if total_reward <= 0.0:
        print(
            f"[GCD SLASH] Event {event_id} has no positive rewards "
            f"(total_reward={total_reward}), skipping."
        )
        return

    # 3) Compute the target penalty
    base_penalty = total_reward * GCD_SLASH_PENALTY_MULTIPLIER

    if stake > 0:
        stake_based_cap = stake * GCD_SLASH_STAKE_FRACTION
    else:
        # if there's no stake, we limit only by the global cap
        stake_based_cap = GCD_SLASH_MAX

    target_penalty = min(base_penalty, stake_based_cap, GCD_SLASH_MAX)

    print(
        f"[GCD SLASH] base_penalty={base_penalty}, stake_based_cap={stake_based_cap}, "
        f"GCD_SLASH_MAX={GCD_SLASH_MAX}, target_penalty={target_penalty}"
    )

    if target_penalty <= 0.0:
        #print(
            #f"[GCD SLASH] Computed target_penalty={target_penalty} for event {event_id}, "
            #f"skipping."
        #)
        logger.debug("Slash: target_penalty=%s <= 0, skipping.", target_penalty)
        return

    # 4) How much more we can/should penalize (idempotently)
    remaining = target_penalty - total_slash
    print(f"[GCD SLASH] remaining={remaining}")

    if remaining <= 0.0:
        #print(
            #f"[GCD SLASH] For event {event_id} enough slash has already been applied "
            #f"(total_slash={total_slash} >= target_penalty={target_penalty}), skipping."
        #)
        logger.info("Slash: already sufficient for event %s (slash=%s >= target=%s)", event_id, total_slash, target_penalty)
        return

    penalty_amount = remaining  # pozitivan broj; u ledger ide -penalty_amount

    #print(
        #f"[GCD SLASH] Upisujem slash_penalty: wallet={wallet}, event_id={event_id}, "
        #f"penalty_amount={penalty_amount}"
    #)
    logger.info("Slash: inserting penalty wallet=%s event=%s amount=%s", wallet, event_id, penalty_amount)

    insert_gcd_ledger_entry(
        wallet_address=wallet,
        amount=-penalty_amount,
        entry_type="slash_penalty",
        event_id=event_id,
        metadata={
            "reason": "moderation_slash",
            "moderation_status": moderation_status,
            "moderator_wallet": moderator_wallet,
            "event_total_reward": total_reward,
            "already_slashed": total_slash,
            "applied_slash": penalty_amount,
            "stake": stake,
            "trust_score": ts,
        },
    )

    # ✅ On-chain slash — burns real GCD tokens on the blockchain
    # If it fails, the off-chain ledger is already written — we don't break the moderation flow
    slash_ok = slash_onchain(wallet, penalty_now)
    if not slash_ok:
        logger.warning(
            "slash_onchain FAILED for %s -%.4f GCD — "
            "off-chain ledger has been written, on-chain burn was not executed.",
            wallet, penalty_now
        )



    logger.info("Slash done: event=%s applied_now=%s", event_id, penalty_amount)



def compute_event_hash(signed_payload: str) -> Optional[str]:
    """
    Computes keccak256(signed_payload) and returns it as a 0x... hex string.
    If there's no payload or an error occurs, returns None.
    """
    if not signed_payload:
        return None

    try:
        # Web3.keccak(text=...) → bytes32; .hex() → '0x...'
        return Web3.keccak(text=signed_payload).hex()
    except Exception as exc:
        print(f"[HASH WARN] compute_event_hash failed: {exc}")
        return None



#w3: Optional[Web3] = None
#w3 = None
#GCD_CONTRACT = None
#gcd_contract = None
#GCD_DECIMALS = 18
'''
GCD_REP_REF = 1000.0

QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
QDRANT_COLLECTION = "fft_events"

# let the vector be 4D, and let's stick with that
QDRANT_VECTOR_SIZE = 4

qdrant_client: Optional[QdrantClient] = None




if AMOY_RPC_URL and GCD_CONTRACT_ADDRESS:
    try:
        w3 = Web3(Web3.HTTPProvider(AMOY_RPC_URL))
        if w3.is_connected():
            GCD_CONTRACT = w3.eth.contract(
                address=Web3.to_checksum_address("0xA9216Afa1f3C0E855fDc5771b6a339A20a5D480D"),
                abi=GCD_ERC20_ABI,
            )
            GCD_DECIMALS = GCD_CONTRACT.functions.decimals().call()
            print(f"[GCD] Web3 povezan, decimals={GCD_DECIMALS}")
        else:
            print("[GCD] Upozorenje: web3 nije povezan (RPC URL ne radi?)")
    except Exception as e:
        print(f"[GCD] Error initializing web3/GCD: {e}")
else:
    print("[GCD] AMOY_RPC_URL ili GCD_CONTRACT_ADDRESS nisu postavljeni.")

print("[DEBUG W3] connected =", w3.is_connected())
'''

#DEPRECATED - ne koristiti, pravu logiku drzi db.get_gcd_balance
#def get_gcd_balance(address: str) -> float:
#    if GCD_CONTRACT is None or w3 is None:
#        return 0.0
#    try:
#        checksum = Web3.to_checksum_address(address)
#        raw = GCD_CONTRACT.functions.balanceOf(checksum).call()
#        human = raw / (10 ** GCD_DECIMALS)
#        return float(human)
#    except Exception as e:
#        print(f"[GCD] Error reading balance for {address}: {e}")
#        return 0.0


#from web3 import Web3

GCD_REP_REF = 1000.0  # or whatever value we've already been using

def compute_source_reputation_from_gcd(address: str) -> float:
    """
    Maps the GCD balance -> [0,1] reputation.
    If the address is invalid or there's no web3/gcd_contract, returns 0.0.
    """
    if not address:
        return 0.0

    # strip whitespace
    addr = address.strip()

    # 1) basic address format check
    if not Web3.is_address(addr):
        print(
            f"[GCD WARN] compute_source_reputation_from_gcd: '{addr}' is not a valid address, rep=0.0"
        )
        return 0.0

    # 2) web3 / kontrakt moraju postojati
    if w3 is None or gcd_contract is None:
        return 0.0

    # 3) convert to a checksum address before calling balanceOf
    try:
        checksum = Web3.to_checksum_address(addr)
    except Exception as exc:
        print(
            f"[GCD WARN] compute_source_reputation_from_gcd: could not build checksum from '{addr}': {exc}"
        )
        return 0.0

    try:
        raw = gcd_contract.functions.balanceOf(checksum).call()
        #decimals = gcd_contract.functions.decimals().call() - to erase
        bal = raw / (10 ** GCD_DECIMALS)
        # e.g. 0 GCD -> 0.0, 1000 GCD -> 1.0, above 1000 capped at 1.0
        rep = float(bal / GCD_REP_REF)
        if rep < 0.0:
            rep = 0.0
        if rep > 1.0:
            rep = 1.0
        return rep
    except Exception as exc:
        print(f"[GCD WARN] Failed to read balance for {checksum}: {exc}")
        return 0.0


def gcd_trust_factor(balance: float) -> float:
    """
    Maps the GCD balance to a multiplicative factor for trust_score.
    0 GCD → ~0.6, higher balance → up to 1.0.
    This is just an initial heuristic that we refine later.
    """
    if balance <= 0:
        return 0.6
    if balance < 10:
        return 0.7
    if balance < 100:
        return 0.85
    if balance < 1000:
        return 0.95
    return 1.0


#Decode auth JWT
def decode_auth_jwt(token: str) -> Dict[str, Any]:
    if not FFT_AUTH_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth secret not configured.")

    try:
        payload = jwt.decode(token, FFT_AUTH_JWT_SECRET, algorithms=["HS256"])
        # opcionalno provjeri issuer/domain
        if payload.get("iss") != FFT_AUTH_DOMAIN:
            raise HTTPException(status_code=401, detail="Invalid token issuer")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_identity(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    """
    NEW: identity exclusively from Authorization: Bearer <jwt>
    """
    if not creds or not creds.credentials:
        # no token -> guest
        return {
            "wallet_address": None,
            "is_system_admin": False,
            "global_permissions": [],
            "quadrant_permissions": {},
            "raw_permissions": [],
        }

    payload = decode_auth_jwt(creds.credentials)
    wallet = normalize_address(payload.get("sub") or "")

    if not wallet or not Web3.is_address(wallet):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    perms = get_permissions_for_wallet(wallet)

    global_perms = [p["permission"] for p in perms if p["quadrant_id"] == "GLOBAL"]
    is_admin = "system_admin" in global_perms

    quadrant_perms: Dict[str, List[str]] = {}
    for p in perms:
        qid = p["quadrant_id"]
        if qid == "GLOBAL":
            continue
        quadrant_perms.setdefault(qid, []).append(p["permission"])

    return {
        "wallet_address": wallet,
        "is_system_admin": is_admin,
        "global_permissions": global_perms,
        "quadrant_permissions": quadrant_perms,
        "raw_permissions": perms,
        "token_payload": payload,
    }



# -------------------------
# Pydantic modeli
# -------------------------

class EventIn(BaseModel):
    event_id: str
    kind: Optional[str] = None
    quadrant_id: Optional[str] = None

    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)

    timestamp: int  # unix timestamp (sekunde)

    topic_tags: List[str] = Field(default_factory=list)

    source_type: str = "human"
    #source_reputation: float = 0.5
    # NEW: reporter confidence (signal from the UI)
    reporter_confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="User-reported confidence [0..1]. Backend clamps + downweights."
    )

    # Legacy (backward compatibility): older frontends may still send source_reputation
    source_reputation: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="LEGACY: old clients. Prefer reporter_confidence."
    )

    device_quality: Optional[float] = None
    stake: float = 0.0
    sensor_values: Optional[List[float]] = None

    # --- transport-specificna polja ---
    vehicle_id: Optional[str] = None
    route_id: Optional[str] = None
    delay_minutes: Optional[float] = None
    severity: Optional[int] = None      # e.g. 1–5

    # --- layer for future authorization ---
    # source_wallet: Optional[List[float]] = None
    source_wallet: Optional[str] = None #source address (GCD wallet)

    # --- H3 / subcell sloj (PRIPREMA)
    subcell_id: Optional[str] = Field(
        default=None,
        description="Server-filled H3/S2 subcell id (e.g. 'H3R13:<index>')."
    )
    h3_resolution: Optional[int] = Field(
        default=None,
        description="Server-filled H3 resolution (if scheme='h3')."
    )

    # 🔐 ANTI-SPOOFING: signature
    signature: Optional[str] = Field(
        default=None,
        description="EIP-191 personal_sign signature of the canonical payload."
    )
    signed_payload: Optional[str] = Field(
        default=None,
        description="Canonical payload string that was signed (debug/log)."
    )


    # 📍 NEW: geo quality fields
    location_accuracy_m: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Estimated location accuracy in meters (from browser/device)."
    )
    location_source: Literal["gps", "wifi", "cell", "manual", "ip"] = Field(
        default="manual",
        description="Location source."
    )
    device_timestamp_ms: Optional[int] = Field(
        default=None,
        ge=0,
        description="Device timestamp (ms) when the location was read."
    )




class EventOut(BaseModel):
    event_id: str
    stored_at: datetime
    trust_score: float
    message: str
    gcd_balance: Optional[float] = None

    # 🔹 New, optional debug fields for the trust breakdown
    ui_rep: Optional[float] = None
    onchain_rep: Optional[float] = None
    combined_rep: Optional[float] = None
    stake: Optional[float] = None
    stake_norm: Optional[float] = None
    base: Optional[float] = None
    bonus_local: Optional[float] = None
    cluster_bonus: Optional[float] = None
    quadrant_id: Optional[str] = None
    subcell_id: Optional[str] = None
    h3_resolution: Optional[int] = None

class WalletGcdBalanceOut(BaseModel):
    wallet_address: str
    gcd_balance: float

class WalletGcdRewardsTodayOut(BaseModel):
    wallet_address: str
    events_today: int
    total_reward_today: float


class EventModerationIn(BaseModel):
    moderation_status: str
    moderation_reason: Optional[str] = None
    # moderator_wallet: str


MODERATION_STATUS_MAP = {
    "ok": "approved",
    "approved": "approved",
    "soft_block": "soft_blocked",
    "soft_blocked": "soft_blocked",
    "fake": "fake",
    "spam": "spam",
    "needs_review": "needs_review",
}

#HELPER FUNCTION (for sanitarization)
ALLOWED_USER_FLAGS = {"flag:suspicious", "flag:fake"}
PRIVILEGED_FLAGS = {"flag:verified"}

def sanitize_topic_tags(tags: List[str]) -> List[str]:
    if not tags:
        return []
    out: List[str] = []
    for t in tags:
        if not t:
            continue
        s = str(t).strip()
        if not s:
            continue

        # NEVER accept verified from client
        if s in PRIVILEGED_FLAGS:
            continue

        # flag:* allowed only user flagove
        if s.startswith("flag:"):
            if s in ALLOWED_USER_FLAGS:
                out.append(s)
            continue

        # simple tag
        out.append(s[:64])

    # keep sequence
    return list(dict.fromkeys(out))


class EventModerationOut(BaseModel):
    event_id: str
    moderation_status: str
    moderation_reason: Optional[str] = None
    moderated_by_wallet: Optional[str] = None
    moderated_at: Optional[datetime] = None


#Pydantic imput model
'''
class QuadrantMetaUpdateIn(BaseModel):
    short_description: Optional[str] = None
    region_type: Optional[str] = None
    ipfs_cid: Optional[str] = None
    owner_wallet: Optional[str] = None
'''
class QuadrantMetaUpdateIn(BaseModel):
    short_description: Optional[str] = None
    quadrant_tags: Optional[List[str]] = None
    quadrant_category: Optional[str] = None
    local_rating: Optional[int] = None


class HealthOut(BaseModel):
    status: str
    db_ok: bool
    qdrant_ok: bool
    web3_ok: bool
    version: str


class EventBrief(BaseModel):
    event_id: str
    quadrant_id: Optional[str] = None
    kind: Optional[str] = None
    timestamp: int
    trust_score: float
    topic_tags: List[str] = []
    subcell_id: Optional[str] = None
    h3_resolution: Optional[int] = None
    
    source_wallet: Optional[str] = None
    gcd_balance: Optional[float] = None

    # same as what the frontend expects in the history
    vehicle_id: Optional[str] = None
    route_id: Optional[str] = None
    delay_minutes: Optional[float] = None
    severity: Optional[int] = None


class EventsSearchRequest(BaseModel):
    quadrant_id: Optional[str] = None
    route_id: Optional[str] = None
    source_wallet: Optional[str] = None
    min_trust: Optional[float] = None
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)

class EventProofOut(BaseModel):
    event_id: str
    event_hash: Optional[str] = None
    source_wallet: Optional[str] = None
    quadrant_id: Optional[str] = None
    timestamp: int


class QuadrantSummary(BaseModel):
    quadrant_id: str
    event_count: int
    avg_trust: float
    last_event_ts: int

class SemanticSearchRequest(BaseModel):
    query: str
    quadrant_id: Optional[str] = None
    top_k: int = 10


class SemanticSearchHit(BaseModel):
    event_id: str
    quadrant_id: Optional[str] = None
    kind: Optional[str] = None
    timestamp: int
    topic_tags: List[str] = []
    trust_score: float
    stake: float
    source_reputation: float
    source_wallet: Optional[str] = None
    route_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    score: float

class SimilarEventsRequest(BaseModel):
    quadrant_id: Optional[str] = None
    kind: Optional[str] = None
    topic_tags: Optional[List[str]] = None
    description: Optional[str] = None
    #limit: int = Field(default=5, ge=1, le=50)
    limit: int = 10
    top_k: int=5


class SimilarEvent(BaseModel):
    event_id: Optional[str] = None
    quadrant_id: Optional[str] = None
    kind: Optional[str] = None
    timestamp: Optional[int] = None
    topic_tags: List[str] = []
    trust_score: Optional[float] = None
    stake: Optional[float] = None
    source_reputation: Optional[float] = None
    source_wallet: Optional[str] = None
    route_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    score: float

class SimilarEventsIn(BaseModel):
    quadrant_id: Optional[str] = None
    kind: Optional[str] = None
    topic_tags: List[str] = []
    top_k: int = 5

class QuadrantUpdateIn(BaseModel):
    short_description: str

class QuadrantMetaOut(BaseModel):
    quadrant_id: str
    short_description: Optional[str] = None
    quadrant_tags: Optional[List[str]] = None
    quadrant_category: Optional[str] = None
    local_rating: Optional[int] = None

    region_type: Optional[str] = None
    owner_wallet: Optional[str] = None
    ipfs_cid: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class QuadrantMetaUpdate(BaseModel):
    short_description: Optional[str] = None
    quadrant_tags: Optional[List[str]] = None
    quadrant_category: Optional[str] = None
    local_rating: Optional[int] = None

class SubcellGeometryOut(BaseModel):
    subcell_id: str
    quadrant_id: str

    lat_center: float
    lon_center: float

    lat_min: float
    lon_min: float
    lat_max: float
    lon_max: float

    # ✅ NEW (optional): actual subcell geometry
    polygon: Optional[List[List[float]]] = Field(
        default=None,
        description="List of [lat, lon] points forming the subcell boundary (closed polygon or open ring)."
    )
    polygon_source: Optional[str] = Field(
        default=None,
        description="Geometry source (e.g. 'h3_boundary')."
    )



# Pydantic models for authorization
class AuthNonceIn(BaseModel):
    wallet: str

class AuthNonceOut(BaseModel):
    wallet: str
    nonce: str
    message: str
    expires_in_sec: int

class AuthLoginIn(BaseModel):
    wallet: str
    nonce: str
    signature: str

class AuthLoginOut(BaseModel):
    wallet: str
    token: str
    token_type: str = "bearer"
    expires_in_sec: int


# -------------------------
# Trust_score logic
# -------------------------

def compute_trust_score(event: EventIn, neighbors: list[dict]) -> float:
    """
    Osnovna logika:
      - baza = source_reputation (0–1)
      - tagovi: flag:verified / flag:suspicious / flag:fake
      - neighbors in the same quadrant and time window affect the bonus
    """
    # 1) base – source reputation
    base = float(np.clip(event.source_reputation, 0.0, 1.0))

    bonus = 0.0
    #tags = set(event.topic_tags or [])
    tags = set(sanitize_topic_tags(event.topic_tags or []))

    # 2) local flags from the frontend
    if "flag:fake" in tags:
        bonus -= 0.4
    elif "flag:suspicious" in tags:
        bonus -= 0.2
    #elif "flag:verified" in tags: # verified only from moderation
        #bonus += 0.1

    # 3) influence of neighboring events
    if neighbors:
        same_kind = [n for n in neighbors if n.get("kind") == event.kind]
        support_ratio = len(same_kind) / len(neighbors) if neighbors else 0.0

        # if neighbors are similar (same kind), we raise the score
        bonus += 0.3 * support_ratio

        # if there are many flag:fake among the neighbors, we lower it
        fake_neighbors = [
            n for n in neighbors
            if "flag:fake" in (n.get("topic_tags") or [])
        ]
        if fake_neighbors:
            frac_fake = len(fake_neighbors) / len(neighbors)
            bonus -= 0.2 * min(1.0, frac_fake)

    final_score = float(np.clip(base + bonus, 0.0, 1.0))

    print(
        f"[DEBUG] event_id={event.event_id}, quadrant_id={event.quadrant_id}, "
        f"base={base:.3f}, bonus={bonus:.3f}, final={final_score:.3f}, "
        f"neighbors={len(neighbors)}"
    )

    return final_score


def _build_query_for_event(stored: Dict[str, Any]) -> str:
    """
    Text query used for the Qdrant semantic_search.
    Should stay consistent with qdrant_store._build_event_text.
    """
    parts = []
    kind = stored.get("kind")
    if isinstance(kind, str):
        parts.append(kind)

    tags = stored.get("topic_tags") or []
    if isinstance(tags, list):
        parts.extend(str(t) for t in tags)

    qid = stored.get("quadrant_id")
    if qid:
        parts.append(f"quadrant:{qid}")

    route_id = stored.get("route_id")
    if route_id:
        parts.append(f"route:{route_id}")

    vehicle_id = stored.get("vehicle_id")
    if vehicle_id:
        parts.append(f"vehicle:{vehicle_id}")

    return " ".join(parts)


def compute_cluster_bonus_qdrant(stored: dict) -> float:
    """
    Anti-cluster signal: if there are many semantically similar events,
    especially from the same wallet, penalize the score to prevent spam.

    Novi prikaz:
    - we only look at the number of similar events (n)
    - and how many different wallets are sending them (spam_ratio)
    """

    '''
    global qdrant_client

    # If Qdrant is not ready – no bonus/penalty
    if qdrant_client is None:
        print("[QDRANT CLUSTER] qdrant_client is None, bonus=0.0")
        return 0.0
    '''

    # If Qdrant is not ready – no bonus/penalty
    from qdrant_store import get_qdrant_client as _get_qdrant
    qdrant_client = _get_qdrant()
    if qdrant_client is None:
        logger.warning("compute_cluster_bonus_qdrant: Qdrant nije dostupan, bonus=0.0")
        return 0.0


    try:
        similar_events = semantic_search_similar_events(
            stored,
            top_k=20,
        )
    except Exception as exc:
        print(f"[QDRANT CLUSTER] Error during semantic_search: {exc}")
        return 0.0

    if not similar_events:
        print("[QDRANT CLUSTER] No similar events => bonus = 0.0")
        return 0.0

    # discard a potential self-hit (though it usually isn't there since the new event isn't in Qdrant yet)
    eid = stored.get("event_id")
    filtered = [
        e for e in similar_events
        if not e.get("event_id") or e.get("event_id") != eid
    ]
    if not filtered:
        print("[QDRANT CLUSTER] Only a self-hit => bonus = 0.0")
        return 0.0

    n = len(filtered)
    uniq_wallets = {
        e.get("source_wallet")
        for e in filtered
        if e.get("source_wallet")
    }

    avg_trust = float(np.mean([e.get("trust_score") or 0.0 for e in filtered]))
    avg_stake = float(np.mean([e.get("stake") or 0.0 for e in filtered]))
    avg_score = float(np.mean([e.get("score") or 0.0 for e in filtered]))

    # Koliko spamuje isti wallet
    spam_ratio = 1.0 if len(uniq_wallets) <= 1 else 1.0 / len(uniq_wallets)

    # ---- NOVA HEURISTIKA ----
    bonus = 0.0

    if spam_ratio >= 0.9 and n >= 3:
        # Linear penalty from the 3rd event onward, max -0.25
        bonus = -min(0.25, 0.05 * (n - 2))
    elif spam_ratio >= 0.6 and n >= 5:
        # If there are still a few more wallets, but one still dominates
        bonus = -min(0.20, 0.04 * (n - 4))

    print(
        f"[QDRANT CLUSTER] n={n}, uniq_wallets={len(uniq_wallets)}, "
        f"avg_trust={avg_trust:.3f}, avg_stake={avg_stake:.2f}, avg_score={avg_score:.3f}, "
        f"spam_ratio={spam_ratio:.2f}, cluster_bonus={bonus:.3f}"
    )

    return bonus


# -------------------------
# Endpointi
# -------------------------

# How much we trust UI reputation vs. on-chain reputation - note: ALPHA_UI + ALPHA_CHAIN must equal 1.0
ALPHA_UI = 0.5     # 50% UI reputation
ALPHA_CHAIN = 0.5  # 50% on-chain GCD reputation

def compute_combined_reputation(ui_rep: float, onchain_rep: float) -> float:
    """
    Combines the reputation from the UI (source_reputation from the form)
    with the reputation derived from the GCD balance (onchain_rep).
    """
    ui_rep = float(np.clip(ui_rep, 0.0, 1.0))
    onchain_rep = float(np.clip(onchain_rep, 0.0, 1.0))

    combined = ALPHA_UI * ui_rep + ALPHA_CHAIN * onchain_rep
    return float(np.clip(combined, 0.0, 1.0))


# Anti-spoofing - uskladjivanje potpisa sa frontendom
def normalize_address(addr: str) -> str:
    if not addr:
        return ""
    addr = addr.strip()
    if not addr.startswith("0x") and not addr.startswith("0X"):
        addr = "0x" + addr
    return addr.lower()


def build_event_sign_payload(
    *,
    event_id: str,
    quadrant_id: Optional[str],
    lat: float,
    lon: float,
    timestamp: int,
    wallet: str,
) -> str:
    """
    Must be exactly 1:1 identical to the string we build on the frontend.
    """
    return (
        "FfT_EVENT_v1|"
        f"event_id={event_id}|"
        f"quadrant_id={quadrant_id or ''}|"
        f"lat={lat:.6f}|"
        f"lon={lon:.6f}|"
        f"ts={timestamp}|"
        f"wallet={normalize_address(wallet)}"
    )


def recover_address_from_signature(message: str, signature: str) -> str:
    eth_msg = encode_defunct(text=message)
    recovered = Account.recover_message(eth_msg, signature=signature)
    return normalize_address(recovered)


# ============================================================
# IPFS / Pinata pinJSONToIPFS (JWT) + optional EIP-191 signature
# ============================================================

PINATA_JWT = os.getenv("FFT_JWT_PINATA", "").strip()
FFT_ADMIN_API_KEY = os.getenv("FFT_ADMIN_API_KEY", "").strip()

PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"

FFT_PIN_REQUIRE_SIG = os.getenv("FFT_PIN_REQUIRE_SIG", "1").strip()  # "1" or "0"
FFT_PIN_MAX_SKEW_SEC = int(os.getenv("FFT_PIN_MAX_SKEW_SEC", "600"))  # 10 min default


# JWT for user authentication
def build_login_message(*, wallet: str, nonce: str) -> str:
    # Message the client signs via personal_sign
    # Set the Domain to distinguish your application from others.
    return (
        "FfT_LOGIN_v1|"
        f"domain={FFT_AUTH_DOMAIN}|"
        f"wallet={normalize_address(wallet)}|"
        f"nonce={nonce}"
    )

def recover_wallet_from_personal_sign(message: str, signature: str) -> str:
    eth_msg = encode_defunct(text=message)
    recovered = Account.recover_message(eth_msg, signature=signature)
    return normalize_address(recovered)

def issue_auth_jwt(wallet: str) -> str:
    if not FFT_AUTH_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth secret not configured.")

    now = int(time())
    exp = now + int(FFT_AUTH_JWT_TTL_SEC)

    payload = {
        "iss": FFT_AUTH_DOMAIN,
        "sub": normalize_address(wallet),
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, FFT_AUTH_JWT_SECRET, algorithm="HS256")


class PinJsonIn(BaseModel):
    """
    Request:
      {
        "json": {...},               # obavezno
        "name": "quadrant_...",      # opcionalno, pinataMetadata.name
        "keyvalues": {...},          # opcionalno, pinataMetadata.keyvalues (Pinata limit: string values)
        "token_id": "123",           # optional: used for signature / policy
        "wallet": "0x...",           # optional: if present and REQUIRE_SIG=1 -> signature required
        "ts": 1730000000,            # optional: unix seconds (recommended when signing)
        "signature": "0x...",        # opcionalno: EIP-191 personal_sign
        "cid_version": 1             # opcionalno (0 ili 1), default 1
      }
    """
    # pydantic v2: dopusti arbitrary JSON
    model_config = ConfigDict(extra="forbid")

    json: Dict[str, Any] = Field(..., description="JSON content for pinJSONToIPFS (pinataContent).")
    name: Optional[str] = Field(default=None, description="Pinata metadata name.")
    keyvalues: Optional[Dict[str, Any]] = Field(default=None, description="Pinata metadata keyvalues (string-ish).")

    token_id: Optional[str] = Field(default=None, description="Optional tokenId/quadrant token id.")
    wallet: Optional[str] = Field(default=None, description="Wallet signing the pin request.")
    ts: Optional[int] = Field(default=None, description="Unix timestamp (seconds) that was signed.")
    signature: Optional[str] = Field(default=None, description="EIP-191 personal_sign signature.")

    cid_version: int = Field(default=1, ge=0, le=1, description="Pinata cidVersion (0 ili 1).")


class PinJsonOut(BaseModel):
    cid: str
    ipfs_uri: str
    pinata_url: str
    name: Optional[str] = None


def _canonical_json_bytes(obj: Any) -> bytes:
    """
    Stabilna kanonikalizacija JSON-a:
    - sort_keys=True
    - separators=(',', ':')
    - ensure_ascii=False
    """
    s = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return s.encode("utf-8")


def _sha256_hex_of_json(obj: Any) -> str:
    return hashlib.sha256(_canonical_json_bytes(obj)).hexdigest()


def build_pin_sign_payload(
    *,
    token_id: Optional[str],
    ts: int,
    wallet: str,
    json_sha256: str,
) -> str:
    """
    Message style similar to signEventPayload (canonical string with separators).
    The frontend must sign EXACTLY this string.

    Format:
      FfT_PIN_v1|token_id=...|ts=...|sha256=...|wallet=0x...
    """
    return (
        "FfT_PIN_v1|"
        f"token_id={token_id or ''}|"
        f"ts={ts}|"
        f"sha256={json_sha256}|"
        f"wallet={normalize_address(wallet)}"
    )


def recover_address_from_personal_sign(message: str, signature: str) -> str:
    """
    Same as your recover_address_from_signature, just a clearer name.
    """
    eth_msg = encode_defunct(text=message)
    recovered = Account.recover_message(eth_msg, signature=signature)
    return normalize_address(recovered)


#Odbijanje starih timestampova
def _is_ts_fresh(ts: int) -> bool:
    now = int(time())
    return abs(now - int(ts)) <= FFT_PIN_MAX_SKEW_SEC


@app.post("/ipfs/pin_json", response_model=PinJsonOut)
async def ipfs_pin_json(
    body: PinJsonIn,
    # admin_key: Optional[str] = Header(default=None, alias="X-FFT-Admin-Key"),
):
    """
    Securely pin JSON to IPFS via the Pinata JWT.
    - The JWT lives only on the backend (PINATA_JWT in env).
    - Opciona provjera potpisa (EIP-191 personal_sign):
        * if body.wallet is present and FFT_PIN_REQUIRE_SIG=1 -> signature required.
        * provjera: recover address == wallet
        * provjera ts window (FFT_PIN_MAX_SKEW_SEC)
        * provjera sha256(json) u poruci

    In beta you can set FFT_PIN_REQUIRE_SIG=0 to test without a signature.
    """

    if not PINATA_JWT:
        raise HTTPException(
            status_code=500,
            detail="PINATA_JWT is not set on serveru (env).",
        )

    # Removed Block1, it was dead code


    # Admin gate (while in beta phase): requires X-FFT-Admin-Key
    #if FFT_ADMIN_API_KEY:
        #if not admin_key or admin_key.strip() != FFT_ADMIN_API_KEY:
            #raise HTTPException(status_code=401, detail="Nevalidan X-FFT-Admin-Key.")


    # 1) Compute sha256 of the JSON (so the signature is bound to the content)
    json_sha = _sha256_hex_of_json(body.json)




    # ✅ Block 2 — the only logic for require_sig:
    # If wallet + signature are present in the request, always verify.
    # Otherwise read from the env variable.
    if body.wallet and body.signature:
        require_sig = True   # ✅ explicit if the client sends a signature
    else:
        require_sig = (FFT_PIN_REQUIRE_SIG.strip() == "1")

    if require_sig and body.wallet:
        if not body.signature:
            raise HTTPException(
                status_code=400,
                detail="signature is mandatory if wallet exists (FFT_PIN_REQUIRE_SIG=1).",
            )
        if body.ts is None:
            raise HTTPException(
                status_code=400,
                detail="ts (unix seconds) is mandatory if  signature is using.",
            )
        if not _is_ts_fresh(int(body.ts)):
            raise HTTPException(
                status_code=401,
                detail="ts outdated (replay protection).",
            )

        msg = build_pin_sign_payload(
            token_id=body.token_id,
            ts=int(body.ts),
            wallet=body.wallet,
            json_sha256=json_sha,
        )

        try:
            recovered = recover_address_from_personal_sign(msg, body.signature)
        except Exception as exc:
            print(f"[PIN SIG] recover failed: {exc}")
            raise HTTPException(
                status_code=400,
                detail="Inavlid signature (recover failed)."
            )

        if normalize_address(recovered) != normalize_address(body.wallet):
            raise HTTPException(
                status_code=401,
                detail="signature does not match the provided wallet.",
            )



    # 3) Sastavi Pinata payload
    pinata_metadata = {}
    if body.name:
        pinata_metadata["name"] = body.name

    # Pinata keyvalues: vrijednosti moraju biti stringovi (ili bar stringifiable)
    if body.keyvalues:
        kv = {}
        for k, v in body.keyvalues.items():
            if v is None:
                continue
            kv[str(k)] = str(v)
        if kv:
            pinata_metadata["keyvalues"] = kv

    payload: Dict[str, Any] = {
        "pinataContent": body.json,
        "pinataOptions": {"cidVersion": int(body.cid_version)},
    }
    if pinata_metadata:
        payload["pinataMetadata"] = pinata_metadata

    headers = {
        "Authorization": f"Bearer {PINATA_JWT}",
        "Content-Type": "application/json",
    }

    # 4) Pozovi Pinata
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(PINATA_PIN_JSON_URL, json=payload, headers=headers)
    except Exception as exc:
        print(f"[PINATA] HTTP error: {exc}")
        raise HTTPException(status_code=502, detail="Unable to connect to the Pinata API.")

    if resp.status_code >= 300:
        # Pinata often returns a JSON error body – show it briefly
        try:
            err = resp.json()
        except Exception:
            err = {"error": resp.text[:300]}
        print(f"[PINATA] error {resp.status_code}: {err}")
        raise HTTPException(status_code=502, detail=f"Pinata error: HTTP {resp.status_code}")

    data = resp.json()
    # we expect IpfsHash in the response
    cid = data.get("IpfsHash")
    if not cid:
        print(f"[PINATA] unexpected response: {data}")
        raise HTTPException(status_code=502, detail="Pinata nije vratio IpfsHash.")

    ipfs_uri = f"ipfs://{cid}"
    pinata_url = f"https://gateway.pinata.cloud/ipfs/{cid}"


    # ✅ On-chain anchor — economically protected timestamp for the CID
    # token_id is optional; the anchor is skipped if not provided
    if body.token_id is not None:
        try:
            token_id_int = int(body.token_id)
            anchor_result = anchor_cid_onchain(
                token_id=token_id_int,
                ipfs_cid=cid,
                event_type="pin_json",
            )
            if anchor_result:
                logger.info(
                    "ipfs_pin_json: anchor OK token=%s cid=%s tx=%s",
                    token_id_int, cid, anchor_result["tx_hash"]
                )
        except Exception as exc:
            logger.warning("ipfs_pin_json: anchor error (not breaking the flow): %s", exc)

    return PinJsonOut(
        cid=cid,
        ipfs_uri=ipfs_uri,
        pinata_url=pinata_url,
        name=body.name,
    )


# ============================================================
# IPFS Gateway proxy (GET /ipfs/cid/{cid})
#   - backend fetchuje Pinata gateway
#   - the frontend no longer goes directly to gateway.pinata.cloud
# ============================================================

FFT_IPFS_GATEWAY = os.getenv("FFT_IPFS_GATEWAY", "https://gateway.pinata.cloud/ipfs/").strip()
FFT_IPFS_GATEWAY = FFT_IPFS_GATEWAY.rstrip("/") + "/"  # guarantee trailing slash

def _sanitize_cid(cid: str) -> str:
    """
    Allow only a CID (no URL) to avoid SSRF.
    Supports input like:
      - bafk...
      - ipfs://bafk...
      - /ipfs/bafk...
      - bafk.../path
    """
    c = (cid or "").strip()

    if c.startswith("ipfs://"):
        c = c[len("ipfs://"):]
    if c.startswith("/ipfs/"):
        c = c[len("/ipfs/"):]

    # take only the first segment
    c = c.split("/")[0].strip()

    if not c or len(c) > 200:
        raise HTTPException(status_code=400, detail="Nevalidan CID.")

    # basic validation: CID is typically base32/base58 => alphanumeric
    if not all(ch.isalnum() for ch in c):
        raise HTTPException(status_code=400, detail="Nevalidan CID format.")

    return c


@app.get("/ipfs/cid/{cid}")
async def ipfs_get_cid(cid: str):
    """
    Proxy for reading JSON metadata from the IPFS gateway.
    Frontend zove:
      GET http://<backend>/ipfs/cid/<CID>
    Backend radi fetch:
      https://gateway.pinata.cloud/ipfs/<CID>
    """
    clean = _sanitize_cid(cid)
    url = FFT_IPFS_GATEWAY + clean

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"IPFS gateway fetch error: {exc}")

    if resp.status_code >= 400:
        # forward the status (e.g. 403/404) – useful for debug
        raise HTTPException(status_code=resp.status_code, detail=f"Gateway HTTP {resp.status_code}")

    # try JSON; if it isn't JSON, return raw (for debugging)
    try:
        data = resp.json()
    except Exception:
        return Response(
            content=resp.text,
            media_type=resp.headers.get("content-type", "text/plain"),
        )

    # proslijedi korisne cache/IPFS headere
    passthrough_headers = {}
    for h in ["etag", "cache-control", "expires", "x-ipfs-path", "x-ipfs-roots"]:
        v = resp.headers.get(h)
        if v:
            passthrough_headers[h] = v

    return JSONResponse(content=data, headers=passthrough_headers)




@app.post("/events", response_model=EventOut)
async def ingest_event(event: EventIn):
    """
    Endpoint for receiving events.

    trust_score depends on:
    - UI reputation (event.source_reputation)
    - on-chain GCD balance (via compute_combined_reputation)
    - stake (event.stake)
    - local history within the quadrant (EVENT_STORE correlation)
    - Qdrant anti-klaster signala (compute_cluster_bonus_qdrant)
    """

    # 0a) Check event_id uniqueness – prevent duplication and double reward
    existing = await asyncio.to_thread(
        get_event_basic_info, event.event_id
    )

    if existing:
        # 409 Conflict would also work here, but 400 is fine too for v0
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Event with event_id={event.event_id} already exists."
        )


    # 🔐0b) If we have source_wallet → require a valid signature (signature verification block)
    
    if event.source_wallet:
        if not event.signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signature is required when source_wallet is provided."
            )

        sign_payload = build_event_sign_payload(
            event_id=event.event_id,
            quadrant_id=event.quadrant_id,
            lat=event.lat,
            lon=event.lon,
            timestamp=event.timestamp,
            wallet=event.source_wallet,
        )

        try:
            recovered_addr = recover_address_from_signature(
                sign_payload, event.signature
            )
        except Exception as exc:
            print(f"[SIG] Error verifying signature: {exc}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid signature.",
            )

        if normalize_address(recovered_addr) != normalize_address(event.source_wallet):
            print(
                f"[SIG] Mismatch: recovered={recovered_addr}, "
                f"source_wallet={event.source_wallet}"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Signature does not match the provided source_wallet.",
            )

        # Optionally: we could also "canonicalize" the wallet here
        source_wallet_verified = normalize_address(recovered_addr)
    else:
        source_wallet_verified = None

    # ✅ Sanitizacija tagova: skini flag:verified + sve nedozvoljene flagove
    clean_tags = sanitize_topic_tags(list(event.topic_tags or []))


    # 0c) Proof-of-event hash (keccak256 nad signed_payload) - staro
    #event_hash = compute_event_hash(getattr(event, "signed_payload", None))
    # 0c) Proof-of-event hash (keccak256 over signed_payload) — computed once
    event_hash = compute_event_hash(getattr(event, "signed_payload", "") or "")

    # 0d) GEO indexing (quadrant + subcell + H3) on the backend
    # The frontend sends quadrant_id = tokenId (string), which remains our canonical value.
    quadrant_id_from_client = event.quadrant_id

    # Default values – what came from the client
    quadrant_id = quadrant_id_from_client
    subcell_id = event.subcell_id
    #h3_resolution = event.h3_resolution or DEFAULT_H3_RESOLUTION
    h3_resolution = event.h3_resolution  # may be None; will be reconciled later

    geo_idx: Optional[GeoIndex] = None
    try:
        geo_idx = index_location(
            lat=event.lat,
            lon=event.lon,
            scheme="h3",
            h3_res=DEFAULT_H3_RESOLUTION,
            # if you want, later:
            # scheme="h3",
            # h3_res=DEFAULT_H3_RESOLUTION,
        )
    except Exception as exc:
        print(f"[GEO_IDX] Error in index_location: {exc}")
        geo_idx = None

    if geo_idx is not None:
        backend_qid = geo_idx.quadrant_id
        subcell_id = geo_idx.subcell_id
        # Uskladi h3_resolution sa subcell_id (da DB ne bude kontradiktoran)
        h3_resolution = _h3_res_from_subcell_id(subcell_id)


        # Log mismatch ONLY if the client sends the geo-format Q_<lat>_<lon>.
        # If it sends tokenId, this is NOT a mismatch but a different identifier.
        if quadrant_id_from_client and isinstance(quadrant_id_from_client, str):
            c = quadrant_id_from_client.strip()
            if c.startswith("Q_") and backend_qid and backend_qid != c:
                print(
                    f"[GEO_IDX MISMATCH] client_geo_qid={c}, "
                    f"backend_geo_qid={backend_qid}, "
                    f"lat={event.lat}, lon={event.lon}"
                )

        '''
        raise HTTPException(
            status_code=422,
            detail=(
                f"Quadrant mismatch: client={quadrant_id_from_client}, "
                f"backend={quadrant_id}. "
                "Check the map or the geo indexing."
            ),
        )
        '''



    # 0) Source wallet (needed for GCD reputation)
    '''
    source_wallet = (event.source_wallet or "").strip()
    if not source_wallet:
        source_wallet = None
    '''
    if source_wallet_verified is not None:
        source_wallet = source_wallet_verified
    else:
        source_wallet = (event.source_wallet or "").strip() or None


    # 0.1) Anti-abuse: daily event limit per wallet
    events_today_for_wallet = 0
    if source_wallet:
        events_today_for_wallet = await asyncio.to_thread(
            get_events_today_for_wallet, source_wallet
        )

        print(
            f"[ABUSE] events_today_for_wallet={events_today_for_wallet} "
            f"for wallet={source_wallet}"
        )

        if events_today_for_wallet >= MAX_EVENTS_PER_WALLET_PER_DAY:
            # Hard limit – too many events today from this wallet
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Too many events today for this wallet. "
                    "Try again tomorrow or increase your stake / reputation."
                ),
            )


    # 1) OLD - UI reputation (0–1)
    #ui_rep = float(np.clip(event.source_reputation or 0.0, 0.0, 1.0))

    # 1) reporter_confidence is signal, not reputation:
    # - fallback: if not sent (old client), take source_reputation
    raw_conf = event.reporter_confidence
    if raw_conf is None and event.source_reputation is not None:
        raw_conf = float(event.source_reputation)

    try:
        raw_conf = float(raw_conf)
    except Exception:
        raw_conf = 0.5

    # ✅ server-siderestrictione (weak signal, no manipulation with extremeces)
    reporter_conf = float(np.clip(raw_conf, 0.2, 0.8))

    # UI signal (keeping the name ui_rep so we don't break the rest of the code)
    ui_rep = reporter_conf


    # 2) On-chain reputation from the GCD balance (0–1)
    onchain_rep = 0.0
    if source_wallet:
        try:
            # pretpostavka: compute_source_reputation_from_gcd(addr) -> float 0–1
            onchain_rep = await asyncio.to_thread(
                compute_source_reputation_from_gcd, source_wallet
            )

        except Exception as exc:
            print(
                f"[GCD WARN] Failed to compute onchain_rep for {source_wallet}: {exc}"
            )
            onchain_rep = 0.0

    # 3) Combined reputation (UI + onchain)
    combined_rep = compute_combined_reputation(ui_rep, onchain_rep)

    # 4) Stake normalizacija
    raw_stake = float(event.stake or 0.0)
    if raw_stake <= 0.0:
        stake_norm = 0.0
    else:
        stake_norm = float(min(raw_stake / STAKE_REF, 1.0))

    # 5) Base score: reputation + stake
    base = 0.6 * combined_rep + 0.4 * stake_norm

    # 6) Local correlation within the same quadrant (EVENT_STORE)
    same_quad = [
        e for e in EVENT_STORE if e.get("quadrant_id") == quadrant_id
    ]

    bonus_local = 0.0
    if same_quad:
        similar_count = sum(
            1
            for e in same_quad
            if e.get("kind") == event.kind
            and e.get("trust_score", 0.5) >= 0.5
        )
        conflict_count = sum(
            1
            for e in same_quad
            if e.get("kind") == "fake"
            or e.get("trust_score", 0.5) < 0.3
        )

        if similar_count > conflict_count:
            bonus_local += 0.1
        if conflict_count > 0 and event.kind == "fake":
            bonus_local -= 0.2

    # 7) temporary dict for the Qdrant cluster analysis (without the final trust_score)

    # (event_hash was already computed once above)

    stored_for_cluster = {
        # Basic identity
        "event_id": event.event_id,
        "quadrant_id": quadrant_id,
        "lat": event.lat,
        "lon": event.lon,
        "kind": event.kind,
        "timestamp": event.timestamp,

        # Proof-of-event hash
        "event_hash": event_hash,
        "signature":getattr(event, "signature", None),
        "signed_payload":getattr(event, "signed_payload", None),

        # Opis i tagovi
        "description": getattr(event, "description", None),
        #"topic_tags": list(event.topic_tags or []),
        "topic_tags": clean_tags,

        # Transport / domain specific
        "vehicle_id": event.vehicle_id,
        "route_id": event.route_id,
        "delay_minutes": event.delay_minutes,
        "severity": event.severity,

        # Stake & reputation - Canonical naming in storage layers is *_reputation (not *_rep)
        "stake": raw_stake,
        "ui_reputation": ui_rep,
        "onchain_reputation": onchain_rep,
        "combined_reputation": combined_rep,

        # Legacy alias (radi kompatibilnosti sa starim kodom / Qdrant payloadom)
        "source_reputation": combined_rep,

        # Lokalni i klaster bonus (privremeno)
        "bonus_local": bonus_local,
        "cluster_bonus": 0.0,      # will be updated after Qdrant analysis
        "trust_score": 0.0,        # privremeno

        # Source and geo-subcell
        "source_wallet": source_wallet,
        "subcell_id": subcell_id,
        "h3_resolution": h3_resolution,

        # Odredjivanje lokacije
        "location_accuracy_m": getattr(event, "location_accuracy_m", None),
        "location_source": getattr(event, "location_source", None),
        "device_timestamp_ms": getattr(event, "device_timestamp_ms", None),

    }

    # 8) Qdrant anti-cluster bonus (semantic similarity)
    cluster_bonus = 0.0
    try:
        cluster_bonus = await asyncio.to_thread(
            compute_cluster_bonus_qdrant, stored_for_cluster
        )
    except Exception as exc:
        print(f"[QDRANT CLUSTER] Error computing cluster_bonus: {exc}")
        cluster_bonus = 0.0


    # 9) Final trust_score
    trust_score = float(
        np.clip(base + bonus_local + cluster_bonus, 0.0, 1.0)
    )

    # update the dicts with the final values
    stored_for_cluster["cluster_bonus"] = cluster_bonus
    stored_for_cluster["trust_score"] = trust_score

    # 10) Final stored (what we store everywhere)
    stored = dict(stored_for_cluster)
    stored["trust_score"] = trust_score
    stored["cluster_bonus"] = cluster_bonus

    if DEBUG_TRUST:
        print(
            f"[DEBUG GCD] event_id={event.event_id}, quad={event.quadrant_id}, ..."
        )


    print(
        #f"[DEBUG GCD] event_id={event.event_id}, quad={event.quadrant_id}, "
        f"ui_rep={ui_rep:.3f}, onchain_rep={onchain_rep:.3f}, combined_rep={combined_rep:.3f}, "
        f"stake={raw_stake:.2f} (norm={stake_norm:.3f}), "
        f"base={base:.3f}, bonus_local={bonus_local:.3f}, "
        f"cluster_bonus={cluster_bonus:.3f}, final={trust_score:.3f}, "
        f"store_size_before={len(EVENT_STORE)}"
    )

    # 11) In memory (for the old correlation mechanism)
    EVENT_STORE.append(stored)


    # 12, 13, 14) Paralelno: DB insert + Qdrant index + GCD reward
    results = await asyncio.gather(
        asyncio.to_thread(
            insert_event,
            stored,
            ui_rep=ui_rep,
            onchain_rep=onchain_rep,
            combined_rep=combined_rep,
            bonus_local=bonus_local,
            cluster_bonus=cluster_bonus,
         ),
        asyncio.to_thread(index_event, stored),
        asyncio.to_thread(reward_event_contributor, stored),
        return_exceptions=True,
    )

   # ✅ Check for errors without breaking the request
    labels = ["insert_event", "index_event", "reward_event_contributor"]
    for label, result in zip(labels, results):
        if isinstance(result, Exception):
            print(f"[ASYNC] Error in {label}: {result}")



    # ✅ On-chain anchor — "review" event tip
    # quadrant_id is a string (tokenId), we convert to int only if it is numeric
    _anchor_token_id = None
    try:
        _anchor_token_id = int(quadrant_id)
    except (TypeError, ValueError):
        pass  # quadrant_id is not a numeric tokenId, skipping the anchor


    logger.info("DEBUG anchor review: quadrant_id=%r _anchor_token_id=%r event_hash=%r", quadrant_id, _anchor_token_id, event_hash)

    if _anchor_token_id is not None:
        try:
            anchor_cid_onchain(
                token_id=_anchor_token_id,
                ipfs_cid=event_hash or event.event_id,   # fallback to event_id
                event_type="review",
            )
        except Exception as exc:
            logger.warning("ingest_event: anchor error (not breaking the flow): %s", exc)


    # 15) Response ka frontendu (EventOut)
    return EventOut(
        event_id=event.event_id,
        stored_at=datetime.utcnow(),
        trust_score=trust_score,
        message="Event received and processed.",
        ui_rep=ui_rep,
        onchain_rep=onchain_rep,
        combined_rep=combined_rep,
        stake=raw_stake,
        stake_norm=stake_norm,
        base=base,
        bonus_local=bonus_local,
        cluster_bonus=cluster_bonus,

        quadrant_id=quadrant_id,
        subcell_id=subcell_id,
        h3_resolution=h3_resolution,
    )


@app.post("/events/search")
def search_events(req: EventsSearchRequest):
    """
    Paginated search of events from the MySQL `events` table.

    Filtri (svi opcioni):
    - quadrant_id
    - route_id
    - source_wallet
    - min_trust

    Paging:
    - limit (1–100)
    - offset (0+)

    Response:
    {
      "items": [...],
      "total": <int>,
      "limit": <int>,
      "offset": <int>
    }
    """
    page = list_events_paginated(
        quadrant_id=req.quadrant_id,
        route_id=req.route_id,
        source_wallet=req.source_wallet,
        min_trust=req.min_trust,
        limit=req.limit,
        offset=req.offset,
    )
    return page





@app.get("/events/by_quadrant", response_model=List[EventBrief])
def get_events_by_quadrant(
    quadrant_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Returns events for a given quadrant from the DB.
    Reads from MySQL, not from the in-memory EVENT_STORE.
    """
    try:
        # ✅ Uses the existing list_events_paginated from db.py
        page = list_events_paginated(
            quadrant_id=quadrant_id,
            limit=limit,
            offset=0,
        )
        items = page.get("items", [])

        # Map to the EventBrief model
        results = []
        for e in items:
            try:
                results.append(EventBrief(**e))
            except Exception as exc:
                print(f"[BY_QUADRANT] Error mapping event: {exc}")
                continue

        return results

    except Exception as exc:
        print(f"[BY_QUADRANT] DB error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Error loading events for quadrant."
        )




# How long events affect the square's color (e.g. the last 3h)
HEAT_WINDOW_SECONDS = 3 * 3600

@app.get("/events/{event_id}/proof", response_model=EventProofOut)
def get_event_proof_endpoint(event_id: str):
    # ✅ get_event_proof() now always returns None or a dict
    # nikad ne propagira MySQLError
    row = get_event_proof(event_id)

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Event proof not found for event_id={event_id}."
        )

    # ✅ Protection against a None timestamp
    try:
        ts = int(row["timestamp"])
    except (TypeError, ValueError):
        ts = 0

    return EventProofOut(
        event_id=row["event_id"],
        event_hash=row.get("event_hash"),
        source_wallet=row.get("source_wallet"),
        quadrant_id=row.get("quadrant_id"),
        timestamp=ts,
    )



@app.get("/events/summary", response_model=List[QuadrantSummary])
def get_events_summary():
    """
    Summary per quadrant for the heatmap.
    Filtrira evente unutar HEAT_WINDOW_SECONDS prozora.
    """
    try:
        # ✅ Pass the time window so it filters like the old EVENT_STORE code
        stats = get_quadrant_stats(window_seconds=HEAT_WINDOW_SECONDS)

        summaries: List[QuadrantSummary] = []
        for row in stats:
            try:
                summaries.append(
                    QuadrantSummary(
                        quadrant_id=str(row["quadrant_id"]),
                        event_count=int(row.get("event_count", 0)),
                        avg_trust=float(row.get("avg_trust", 0.0)),
                        last_event_ts=int(row.get("last_event_ts", 0)),  # ✅ now present
                    )
                )
            except Exception as exc:
                logger.error("Summary mapping error: %s", exc)
                continue

        return summaries

    except Exception as exc:
        logger.error("get_events_summary DB error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Error loading events summary."
        )




@app.get("/stats/by_quadrant")
def stats_by_quadrant():
    """
    Simple endpoint for per-quadrant statistics from MySQL.
    """
    return get_quadrant_stats()


@app.post("/events/semantic_search", response_model=List[SemanticSearchHit])
def events_semantic_search(body: SemanticSearchRequest):
    """
    Semantic search of events via Qdrant.

    - body.query: free text (e.g. "traffic accident on R1")
    - body.quadrant_id: optional filter on a single L0 quadrant
    - body.top_k: maksimalan broj rezultata
    """
    try:
        hits = qdrant_semantic_search(
            query=body.query,
            top_k=body.top_k,
            quadrant_id=body.quadrant_id,
        )
    except Exception as exc:
        print(f"[QDRANT] Error during semantic_search: {exc}")
        return []

    # mapiraj dict -> SemanticSearchHit
    out: List[SemanticSearchHit] = []
    for h in hits:
        out.append(
            SemanticSearchHit(
                event_id=str(h.get("event_id") or ""),
                quadrant_id=h.get("quadrant_id"),
                kind=h.get("kind"),
                timestamp=int(h.get("timestamp") or 0),
                topic_tags=h.get("topic_tags") or [],
                trust_score=float(h.get("trust_score") or 0.0),
                stake=float(h.get("stake") or 0.0),
                source_reputation=float(h.get("source_reputation") or 0.0),
                source_wallet=h.get("source_wallet"),
                route_id=h.get("route_id"),
                vehicle_id=h.get("vehicle_id"),
                score=float(h.get("score") or 0.0),
            )
        )
    return out

@app.on_event("startup")
def on_startup():
    """
    Startup hook:
    - podigne MySQL connection pool
    - "warms up" the Qdrant client (creates the collection if needed)
    Web3/GCD is already initialized when the module is imported.
    """
    # 1) DB pool
    init_db_pool()

    # 2) Qdrant client – just to check that it works
    try:
        client = get_qdrant_client()
        print("[QDRANT] Klijent spreman.")
    except Exception as exc:
        print(f"[QDRANT] init error: {exc}")



@app.post("/events/similar")
def find_similar_events(req: SimilarEventsRequest):
    """
    Endpoint for the React "Show similar events" button.

    Here we deliberately use the "raw" semantic_search (qdrant_semantic_search)
    with the text query, separate from the anti-cluster logic.
    """

    # Build the query text from the available fields
    text_parts: List[str] = []

    if req.kind:
        text_parts.append(str(req.kind))

    if req.description:
        text_parts.append(str(req.description))

    if req.topic_tags:
        text_parts.extend([str(tag) for tag in req.topic_tags])

    query_text = " ".join(text_parts).strip()
    if not query_text:
        query_text = "event"  # fallback da Qdrant ne dobije prazan string

    try:
        hits = qdrant_semantic_search(
            query=query_text,
            top_k=req.limit,
            quadrant_id=req.quadrant_id,
        )
        print(f"[SIMILAR DEBUG] query_text={query_text!r}, quadrant={req.quadrant_id}, hits={len(hits)}")
        for h in hits:
            print(f"[SIMILAR HIT] id={h.get('event_id')} score={h.get('score')} trust={h.get('trust_score')}") 

        return {"items": hits}
    except Exception as exc:
        print(f"[QDRANT /events/similar] Error: {exc}")
        raise HTTPException(status_code=500, detail="Qdrant search error")


@app.get("/health", response_model=HealthOut)
def health_check():
    #global w3, gcd_contract
    """
    Simple health-check for the backend:
    - DB konekcija (MySQL)
    - Qdrant dostupnost
    - Web3 / GCD ugovor
    """
    # ---- DB provjera ----
    db_ok = False
    try:
        from db import events_pool  # already exists as a global in db.py
        if events_pool is not None:
            conn = events_pool.get_connection()
            conn.close()
            db_ok = True
    except Exception as exc:
        #print(f"[HEALTH] DB check fail: {exc}")
        logger.error("Health check DB fail: %s", exc)
        db_ok = False

    # ---- Qdrant provjera ----
    qdrant_ok = False
    try:
        from qdrant_store import get_qdrant_client
        client = get_qdrant_client()
        # trivialan call – recimo listanje kolekcija
        _ = client.get_collections()
        qdrant_ok = True
    except Exception as exc:
        #print(f"[HEALTH] Qdrant check fail: {exc}")
        logger.error("Health check Qdrant fail: %s", exc)
        qdrant_ok = False

    #print("[HEALTH DEBUG] AMOY_RPC_URL =", AMOY_RPC_URL)
    #print("[HEALTH DEBUG] w3 is None?", (w3 is None))
    #print("[HEALTH DEBUG] w3 connected =", (w3.is_connected() if w3 else None))
    #print("[HEALTH DEBUG] gcd_contract is None?", (gcd_contract is None))

    # ---- Web3 / RPC provjera ----
    web3_ok = False
    try:
        if w3 is not None and w3.is_connected():
            _ = w3.eth.block_number   # lagan RPC ping
            web3_ok = True
    except Exception as exc:
        #print(f"[HEALTH] Web3/RPC check fail: {exc}")
        logger.error("Health check Web3/RPC fail: %s", exc)
        web3_ok = False

    # ✅ Geo sheme
    from geo_grid import get_available_schemes
    geo_schemes = get_available_schemes()
    if not geo_schemes["h3"]:
        logger.warning(
            "H3 library nije dostupna. "
            "Geo indeksing koristi BBOX fallback. "
            "Install: pip install h3"
        )


    # status = "ok" only if everything passed
    status = "ok" if (db_ok and qdrant_ok and web3_ok) else "degraded"

    return HealthOut(
        status=status,
        db_ok=db_ok,
        qdrant_ok=qdrant_ok,
        web3_ok=web3_ok,
        version="0.1.0-beta",  # feel free to change this to your own
    )


#Endpoint for authorization (reads identity via Depends etc.) - COMMENTED OUT, ENABLE WHEN NEEDED
'''
@app.put("/quadrants/{quadrant_id}/short_description")
def update_quadrant_short_description(
    quadrant_id: str,
    body: QuadrantUpdateIn,
    identity: Dict[str, Any] = Depends(get_current_identity),
):
    """
    Update the quadrant's short description.

    Pravila:
      - if they have ROLE_ADMIN → always allowed
      - if they have ROLE_QUADRANT_EDITOR and permission='editor' for this quadrant → allowed
      - others → 403
    """
    wallet = identity.get("wallet_address")
    roles = identity.get("roles") or []

    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nedostaje X-FFT-Wallet header.",
        )

    # Admin can always
    if ROLE_ADMIN in roles:
        allowed = True
    else:
        # Otherwise check quadrant_permissions
        perms = get_quadrant_permissions_for_wallet(wallet, quadrant_id)
        allowed = ("editor" in perms) or (ROLE_QUADRANT_EDITOR in roles and "editor" in perms)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to edit this quadrant.",
        )

    # If everything above passed, perform an UPDATE on quadrants_l0
    conn = get_connection()
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DB konekcija nije dostupna.",
        )

    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE quadrants_l0
            SET short_description = %s
            WHERE quadrant_id = %s
            """,
            (body.short_description, quadrant_id),
        )
        conn.commit()
    except MySQLError as exc: #<--- Name error
        print(f"[DB] Error in update_quadrant_short_description: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DB error while updating the quadrant.",
        )
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    return {
        "quadrant_id": quadrant_id,
        "short_description": body.short_description,
        "updated_by": wallet,
    }
'''


@app.get("/whoami")
def whoami(identity: Dict[str, Any] = Depends(get_current_identity)):
    """
    Returns the currently recognized identity, based on the wallet address in the request.
    The wallet is read from the get_request_wallet() helper (header / query, as already implemented).
    """
    return identity


@app.get("/wallet/gcd_balance", response_model=WalletGcdBalanceOut)
def wallet_gcd_balance(
    identity: Dict[str, Any] = Depends(get_current_identity),
):
    """
    Returns the off-chain GCD balance for the current wallet (based on the X-Wallet-Address header).
    """
    wallet = identity.get("wallet_address")
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wallet address not found in identity (X-Wallet-Address).",
        )

    balance = db_get_gcd_balance(wallet)
    print(f"[GCD DEBUG] /wallet/gcd_balance wallet={wallet} -> {balance}")
    return WalletGcdBalanceOut(wallet_address=wallet, gcd_balance=balance)


@app.get("/wallet/gcd_rewards_today", response_model=WalletGcdRewardsTodayOut)
def wallet_gcd_rewards_today(
    identity: Dict[str, Any] = Depends(get_current_identity),
):
    """
    Returns how much GCD reward (event_reward) the user has received today
    and for how many events.
    """
    wallet = identity.get("wallet_address")
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wallet address not found in identity (X-Wallet-Address).",
        )

    count, total = db_get_gcd_event_rewards_today(wallet)
    print(
        f"[GCD DEBUG] /wallet/gcd_rewards_today wallet={wallet} "
        f"-> events_today={count}, total_reward_today={total}"
    )
    return WalletGcdRewardsTodayOut(
        wallet_address=wallet,
        events_today=count,
        total_reward_today=total,
    )


@app.patch("/quadrants/{quadrant_id}/meta", response_model=QuadrantMetaOut)
def patch_quadrant_meta_endpoint(
    quadrant_id: str,
    body: QuadrantMetaUpdateIn,
    identity: Dict[str, Any] = Depends(get_current_identity),
):
    # 1) permission check – system_admin ili quadrant_editor
    ensure_can_edit_quadrant(identity, quadrant_id)

    # 2) UPDATE u bazi
    ok = update_quadrant_meta(
        quadrant_id=quadrant_id,
        short_description=body.short_description,
        quadrant_tags=body.quadrant_tags or [],
        quadrant_category=body.quadrant_category,
        local_rating=body.local_rating,
    )
    if not ok:
        raise HTTPException(
            status_code=404,
            detail="Quadrant not found or not updated.",
        )

    # 3) Reload the fresh state and return it as QuadrantMetaOut
    row = get_quadrant_meta(quadrant_id)
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Quadrant not found after update.",
        )
    # ✅ On-chain anchor — "oracle_confirm" event type (quadrant meta update)
    try:
        _meta_token_id = int(quadrant_id)
        anchor_cid_onchain(
            token_id=_meta_token_id,
            ipfs_cid=row.get("ipfs_cid") or f"meta_update:{quadrant_id}",
            event_type="oracle_confirm",
        )
    except (TypeError, ValueError):
        pass  # quadrant_id is not numeric
    except Exception as exc:
        logger.warning("patch_quadrant_meta: anchor error (not breaking the flow): %s", exc)

    return QuadrantMetaOut(**row)



@app.get("/quadrants/{quadrant_id}", response_model=QuadrantMetaOut)
def get_quadrant_meta_endpoint(quadrant_id: str):
    row = get_quadrant_meta(quadrant_id)
    if not row:
        raise HTTPException(status_code=404, detail="Quadrant not found.")
    return QuadrantMetaOut(**row)


@app.get("/quadrants")
def get_minted_quadrants(
    limit: int = Query(5000, ge=1, le=20000),
    offset: int = Query(0, ge=0),
):
    """
    PUBLIC endpoint for the frontend map.
    Returns the list of minted token_id values from the DB (quadrants_minted),
    plus indexer state (last_scanned_block).
    """
    page = list_quadrants_minted(limit=limit, offset=offset)
    st = get_quadrants_indexer_state()
    return {
        "count": len(page["items"]),
        "total": page["total"],
        "limit": page["limit"],
        "offset": page["offset"],
        "last_scanned_block": int(st.get("last_scanned_block") or 0),
        "last_run_at": st.get("last_run_at"),
        "last_error": st.get("last_error"),
        "items": page["items"],
    }


@app.get("/quadrants/indexer/status")
def quadrants_indexer_status(
    admin_key: Optional[str] = Header(default=None, alias="X-FFT-Admin-Key"),
):
    """
    Admin/status endpoint.
    """
    _require_admin_key(admin_key)
    st = get_quadrants_indexer_state()
    return {
        "enabled": True,
        "last_scanned_block": int(st.get("last_scanned_block") or 0),
        "last_run_at": st.get("last_run_at"),
        "last_error": st.get("last_error"),
        "config": {
            "quadrants_address": QUADRANTS_ADDRESS,
            "deploy_from_block": QUADRANTS_DEPLOY_FROM_BLOCK,
            "step_start": FFT_QIDX_STEP_START,
            "step_min": FFT_QIDX_STEP_MIN,
            "step_max": FFT_QIDX_STEP_MAX,
        },
    }


def _topic32(x: str) -> str:
    """
    Normalize topic to 32-byte hex string with 0x prefix.
    Accepts:
      - "0xddf2..." (already ok)
      - "ddf2..." (missing 0x)
      - "0x0" / "0" (will be padded)
    Returns: "0x" + 64 hex chars
    """
    s = (str(x) if x is not None else "").strip().lower()
    if s.startswith("0x"):
        s = s[2:]
    # keep only hex-ish characters; optional but safe
    # (if you want stricter: validate with int(s,16) in try/except)
    s = s.rjust(64, "0")
    return "0x" + s



@app.post("/quadrants/indexer/run")
def quadrants_indexer_run(
    admin_key: Optional[str] = Header(default=None, alias="X-FFT-Admin-Key"),
):
    """
    Admin endpoint that scans Transfer mint logs and populates quadrants_minted.

    Runs in an adaptive while loop (step is reduced on an RPC limit error).
    State se pamti u quadrants_indexer_state (id=1).
    """
    _require_admin_key(admin_key)

    if not QUADRANTS_ADDRESS or not Web3.is_address(QUADRANTS_ADDRESS):
        raise HTTPException(status_code=500, detail="QUADRANTS_ADDRESS not valid or not adjusted.")

    # Separate web3 for the quadrants scan (does not depend on GCD_CONTRACT_ADDRESS)
    w3q = Web3(Web3.HTTPProvider(AMOY_RPC_URL))
    if not w3q.is_connected():
        raise HTTPException(status_code=502, detail="Web3 not connected (AMOY_RPC_URL).")

    latest = int(w3q.eth.block_number)

    st = get_quadrants_indexer_state()
    last_scanned = int(st.get("last_scanned_block") or 0)

    # start from max(deploy_from_block, last_scanned+1)
    start = max(int(QUADRANTS_DEPLOY_FROM_BLOCK), last_scanned + 1)

    if start > latest:
        return {
            "ok": True,
            "message": "No new blocks to scan.",
            "latest_block": latest,
            "from_block": start,
            "to_block": latest,
            "inserted": 0,
            "updated_state_last_scanned_block": last_scanned,
        }

    step = int(FFT_QIDX_STEP_START)
    inserted = 0
    scanned_to = last_scanned
    last_error = None

    # topics:
    # [0] Transfer sig
    # [1] from (0x00..00) => mint
    # [2] to
    # [3] tokenId (uint256)

    #topic0 = TRANSFER_TOPIC0
    #topic1_from_zero = "0x" + "0" * 64
    topic0 = _topic32(TRANSFER_TOPIC0)
    topic1_from_zero = _topic32("0x0") # mint: from == 0x0

    try:
        while start <= latest:
            end = min(start + step - 1, latest)

            params = {
                "fromBlock": hex(start),
                "toBlock": hex(end),
                "address": Web3.to_checksum_address(QUADRANTS_ADDRESS),
                "topics": [topic0, topic1_from_zero],
            }

            try:
                print("[QIDX] topic0=", topic0, "topic1=", topic1_from_zero)
                logs = w3q.eth.get_logs(params)
            except Exception as exc:
                msg = str(exc)
                msg_lower = msg.lower()
                # ✅ Alchemy Free tier for Polygon returns a different message than
                # the generic "block range exceeds configured limit" —
                # e.g. "you can make eth_getLogs requests with up to a 10
                # block range... Upgrade to PAYG for expanded block range."
                # We catch both forms instead of relying on the exact text.
                is_range_limit = (
                    "block range exceeds configured limit" in msg_lower
                    or ("block range" in msg_lower and "limit" in msg_lower)
                    or "upgrade to payg" in msg_lower
                )
                if is_range_limit and step > int(FFT_QIDX_STEP_MIN):
                    step = max(int(FFT_QIDX_STEP_MIN), step // 2)
                    print(f"[QIDX] range limit, reducing step => {step} (start={start}, end={end})")
                    continue

                # second error => abort
                raise

            # process logs
            for lg in logs or []:
                try:
                    block_num = int(lg.get("blockNumber") or 0)
                    txh = lg.get("transactionHash")
                    tx_hash = txh.hex() if hasattr(txh, "hex") else str(txh)
                    log_index = int(lg.get("logIndex") or 0)

                    topics = lg.get("topics") or []
                    # ERC721 Transfer mint => tokenId u topics[3]
                    token_hex = topics[3].hex() if hasattr(topics[3], "hex") else str(topics[3])
                    token_id_int = int(token_hex, 16)
                    token_id = str(token_id_int)

                    to_topic = topics[2].hex() if hasattr(topics[2], "hex") else str(topics[2])
                    owner_wallet = "0x" + to_topic[-40:]
                    owner_wallet = Web3.to_checksum_address(owner_wallet)

                    upsert_quadrant_minted(
                        token_id=token_id,
                        minted_block=block_num,
                        tx_hash=tx_hash,
                        log_index=log_index,
                        owner_wallet=owner_wallet,
                        # resolution/cell_id/lat/lon can be added later (or now if you want to decode)
                    )
                    inserted += 1
                except Exception as exc:
                    print(f"[QIDX] log parse/upsert fail: {exc}")
                    continue

            scanned_to = end
            set_quadrants_indexer_state(last_scanned_block=scanned_to, last_error=None)

            # success => slightly increase the step, up to the max
            if step < int(FFT_QIDX_STEP_MAX):
                step = min(int(FFT_QIDX_STEP_MAX), int(step * 1.25))

            start = end + 1

    except Exception as exc:
        last_error = str(exc)
        set_quadrants_indexer_state(last_scanned_block=scanned_to, last_error=last_error)
        raise HTTPException(status_code=500, detail=f"indexer failed: {last_error}")

    return {
        "ok": True,
        "latest_block": latest,
        "from_block": max(int(QUADRANTS_DEPLOY_FROM_BLOCK), last_scanned + 1),
        "to_block": scanned_to,
        "inserted": inserted,
        "updated_state_last_scanned_block": scanned_to,
    }




@app.patch("/events/{event_id}/moderation", response_model=EventModerationOut)
def moderate_event(
    event_id: str,
    body: EventModerationIn,
    identity: Dict[str, Any] = Depends(get_current_identity),
):
    wallet = identity.get("wallet_address")
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wallet address is required for moderation.",
        )

    # 1) Find the event's quadrant
    quad_id = get_event_quadrant(event_id)
    if not quad_id:
        raise HTTPException(status_code=404, detail="Event not found.")

    # 2) Permission check
    ensure_can_moderate_event(identity, quad_id)

    # 3) UPDATE u bazi
    rows = update_event_moderation(
        event_id=event_id,
        moderation_status=body.moderation_status,
        moderation_reason=body.moderation_reason,
        moderator_wallet=wallet,
    )

    if rows == 0:
        raise HTTPException(
            status_code=404,
            detail="Event not found or not updated.",
        )

    # 4) If moderation is negative (fake/spam) -> try to apply a GCD slash
    if body.moderation_status in ("fake", "spam"):
        print(
            f"[GCD SLASH] moderate_event: status={body.moderation_status}, "
            f"event={event_id}, wallet={wallet}"
        )
        try:
            apply_slash_for_event(
                event_id=event_id,
                moderation_status=body.moderation_status,
                moderator_wallet=wallet,
            )
        except Exception as exc:
            # We don't break the API call because of the slash – just log it
            print(f"[GCD SLASH] Error in apply_slash_for_event({event_id}): {exc}")

    return EventModerationOut(
        event_id=event_id,
        moderation_status=body.moderation_status,
        moderation_reason=body.moderation_reason,
        moderated_by_wallet=wallet,
        moderated_at=datetime.utcnow(),
    )

'''
@app.post("/events/{event_id}/moderate")
def moderate_event(event_id: str, body: EventModerationIn):
    # 1) Check that the event exists
    existing = get_event_basic_info(event_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event sa event_id={event_id} ne postoji."
        )

    raw_status = (body.moderation_status or "").strip()
    canonical_status = MODERATION_STATUS_MAP.get(raw_status)

    if not canonical_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nepoznat moderation_status='{raw_status}'."
        )

    try:
        update_event_moderation(
            event_id=event_id,
            moderation_status=canonical_status,
            moderation_reason=body.moderation_reason,
            moderator_wallet=body.moderator_wallet,
        )
    except Exception as exc:
        print(f"[MODERATE] DB error for event_id={event_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating moderation."
        )

    return {
        "event_id": event_id,
        "moderation_status": canonical_status,
        "reason": body.moderation_reason,
        "moderator_wallet": body.moderator_wallet,
    }
'''



@app.get("/geo/subcell_for_point", response_model=SubcellGeometryOut)
def geo_subcell_for_point(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
):
    """
    Return the geometry of the sub-cell (H3/S2-like) for the given point.
    We use the same steps as in geo_grid.py (GRID_LAT_STEP_DEG / GRID_LON_STEP_DEG).
    """
        
    try:
        import h3
        #print("[GEO] h3 import OK, module=", h3)
        logger.debug("H3 module loaded: %s", h3)
    except Exception as exc:
        #print("[GEO] h3 import FAILED:", exc)
        logger.error("H3 import failed: %s", exc)
    

    # ✅ MUST exist before using it below
    subcell_id = subcell_id_from_latlon(lat, lon)

    # Subcell center (optional, but useful for debugging)
    center_lat, center_lon = subcell_center_latlon(subcell_id)

    # Quadrant containing the center
    quadrant_id = quadrant_id_from_latlon(center_lat, center_lon)

    polygon = None
    polygon_source = None

    # ✅ Actual geometry (for H3): take the boundary from the h3 cell
    # subcell_id format: "H3R13:<index>"
    """
    if isinstance(subcell_id, str) and subcell_id.startswith("H3R") and ":" in subcell_id:
        try:
            import h3 #this was added

            _, h3_index = subcell_id.split(":", 1)

            # h3.cell_to_boundary returns a list of the cell boundary coordinates.
            # In newer h3-py it can be (lat, lon) or (lon, lat) depending on parameters / version.
            # So we'll heuristically figure out which is which.
            #boundary = h3.cell_to_boundary(h3_index)
            boundary = h3.cell_to_boundary(h3_index)

            ring: List[List[float]] = []
            for a, b in boundary:
                # heuristika: lat mora biti [-90,90], lon [-180,180]
                if -90.0 <= a <= 90.0 and -180.0 <= b <= 180.0:
                    lat_i, lon_i = float(a), float(b)
                else:
                    # it is probably (lon, lat)
                    lat_i, lon_i = float(b), float(a)
                ring.append([lat_i, lon_i])

            # optional: close the polygon (make the last point equal to the first)
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])

            polygon = ring
            polygon_source = "h3_boundary"

        except Exception as exc:
            print(f"[GEO] H3 boundary failed: subcell_id={subcell_id} exc={repr(exc)}")
            print(f"[GEO] h3 boundary failed for subcell_id={subcell_id}: {exc}")
            polygon = None
            polygon_source = None
    """


    if isinstance(subcell_id, str) and subcell_id.startswith("H3R") and ":" in subcell_id:
        try:
            import h3
            _, h3_index = subcell_id.split(":", 1)
 
            # ✅ Explicit output format: (lat, lon)
            boundary = h3.cell_to_boundary(h3_index)
            #print("[GEO] boundary type:", type(boundary))
            #print("[GEO] boundary len:", len(boundary) if boundary is not None else None)
            #print("[GEO] boundary sample:", boundary[:2] if isinstance(boundary, (list, tuple)) else boundary)
            logger.debug("H3 boundary type=%s len=%s sample=%s", type(boundary), len(boundary) if boundary else None, boundary[:2] if isinstance(boundary, (list, tuple)) else boundary)
            #boundary = h3.cell_to_boundary(h3_index, geo_json=False)
            #boundary_raw = h3.cell_to_boundary(h3_index)
            #boundary = list(boundary_raw)

            print("[GEO] boundary type:", type(boundary), "value:", boundary)

            ring: List[List[float]] = []
            for lat_i, lon_i in boundary:
                ring.append([float(lat_i), float(lon_i)])

            # close polygon
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])

            polygon = ring
            polygon_source = "h3_boundary"

        except Exception as exc:
            #print(f"[GEO] H3 boundary failed: subcell_id={subcell_id} exc={repr(exc)}")
            logger.error("H3 boundary failed for subcell_id=%s: %r", subcell_id, exc)
            polygon = None
            polygon_source = None


    # ✅ bbox from the polygon (if it exists), otherwise fallback to the center
    if polygon:
        lats = [p[0] for p in polygon]
        lons = [p[1] for p in polygon]
        lat_min = float(min(lats))
        lat_max = float(max(lats))
        lon_min = float(min(lons))
        lon_max = float(max(lons))
    else:
        lat_min = center_lat
        lat_max = center_lat
        lon_min = center_lon
        lon_max = center_lon

    return SubcellGeometryOut(
        subcell_id=subcell_id,
        quadrant_id=quadrant_id,
        lat_center=center_lat,
        lon_center=center_lon,
        lat_min=lat_min,
        lon_min=lon_min,
        lat_max=lat_max,
        lon_max=lon_max,
        polygon=polygon,
        polygon_source=polygon_source,
    )


# ============================================================
# Quadrant CID Timeline — auditabilan vremenski niz
# ============================================================

from anchor import ANCHOR_ABI, ANCHOR_CONTRACT_ADDRESS, AMOY_RPC_URL

class CIDTimelineEntry(BaseModel):
    ipfs_cid: str
    block_number: int
    timestamp: int
    timestamp_iso: str
    author: str
    event_type: str
    ipfs_url: str

class CIDTimelineOut(BaseModel):
    token_id: int
    entries: List[CIDTimelineEntry]
    total: int = 0

@app.get("/quadrant/{token_id}/timeline", response_model=CIDTimelineOut)
async def get_quadrant_timeline(
    token_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if not ANCHOR_CONTRACT_ADDRESS or not Web3.is_address(ANCHOR_CONTRACT_ADDRESS):
        raise HTTPException(
            status_code=503,
            detail="ANCHOR_CONTRACT_ADDRESS is not configured on the server."
        )

    try:
        w3 = Web3(Web3.HTTPProvider(AMOY_RPC_URL))
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(ANCHOR_CONTRACT_ADDRESS),
            abi=ANCHOR_ABI,
        )
        raw_history = contract.functions.getCIDHistory(token_id).call()
    except Exception as exc:
        logger.error("get_quadrant_timeline: error reading the chain: %s", exc)
        raise HTTPException(status_code=502, detail=f"Chain read error: {exc}")

    total = len(raw_history)
    
    # Najnoviji unosi prvi — reverse pa slice
    paged = list(reversed(raw_history))[offset : offset + limit]

    entries = []
    for entry in paged:
        ipfs_cid, block_number, timestamp, author, event_type = entry
        entries.append(CIDTimelineEntry(
            ipfs_cid=ipfs_cid,
            block_number=block_number,
            timestamp=timestamp,
            timestamp_iso=datetime.utcfromtimestamp(timestamp).isoformat() + "Z",
            author=author,
            event_type=event_type,
            ipfs_url=f"https://gateway.pinata.cloud/ipfs/{ipfs_cid}",
        ))

    return CIDTimelineOut(token_id=token_id, entries=entries, total=total)



@app.post("/auth/nonce", response_model=AuthNonceOut)
def auth_nonce(body: AuthNonceIn, request: Request):
    wallet = normalize_address(body.wallet)

    if not Web3.is_address(wallet):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    nonce = secrets.token_urlsafe(24)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    # ✅ Check the return value
    ok = auth_create_nonce(
        wallet_address=wallet,
        nonce=nonce,
        ttl_sec=AUTH_NONCE_TTL_SEC,
        ip=ip,
        ua=ua,
    )

    if not ok:
        # ✅ 503 Service Unavailable — DB nije dostupan
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable. Try again shortly.",
        )

    msg = build_login_message(wallet=wallet, nonce=nonce)
    return AuthNonceOut(
        wallet=wallet,
        nonce=nonce,
        message=msg,
        expires_in_sec=AUTH_NONCE_TTL_SEC,
    )



@app.post("/auth/login", response_model=AuthLoginOut)
def auth_login(body: AuthLoginIn, request: Request):
    wallet = normalize_address(body.wallet)
    nonce = (body.nonce or "").strip()
    signature = (body.signature or "").strip()

    if not Web3.is_address(wallet):
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    if not nonce or len(nonce) < 8:
        raise HTTPException(status_code=400, detail="Invalid nonce")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    row = auth_get_valid_nonce(wallet_address=wallet, nonce=nonce)
    if not row:
        raise HTTPException(status_code=401, detail="Nonce invalid/expired/used")

    msg = build_login_message(wallet=wallet, nonce=nonce)
    try:
        recovered = recover_wallet_from_personal_sign(msg, signature)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Signature recover failed: {exc}"
        )

    if normalize_address(recovered) != normalize_address(wallet):
        raise HTTPException(
            status_code=401,
            detail="Signature does not match wallet"
        )

    ip = request.client.host if request.client else None

    # ✅ Check the return value
    marked = auth_mark_nonce_used(row_id=int(row["id"]), ip=ip)
    if not marked:
        # ✅ Nonce was not marked — potential replay attack or DB problem
        # Safely reject the login to prevent replay
        logger.warning(
            "auth_login: auth_mark_nonce_used failed for wallet=%s row_id=%s",
            wallet, row["id"],
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable. Try again shortly.",
        )

    token = issue_auth_jwt(wallet)
    return AuthLoginOut(
        wallet=wallet,
        token=token,
        expires_in_sec=int(FFT_AUTH_JWT_TTL_SEC),
    )

