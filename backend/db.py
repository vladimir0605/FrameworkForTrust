# backend/db.py - function for reading quadrant metadata

import os
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from mysql.connector.pooling import MySQLConnectionPool
from decimal import Decimal

#events_pool: Optional[MySQLConnectionPool] = None
events_pool = None

logger = logging.getLogger(__name__)

# ---- 1) Database configuration ----

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    #"port": int(os.getenv("DB_PORT")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "fft_db"),
}

POOL_NAME = "fft_pool"
POOL_SIZE = int(os.getenv("FFT_DB_POOL_SIZE", "5"))

#MAX_EVENTS_PER_WALLET_PER_DAY = 80  # adjust freely (e.g. 100, 50, 20...)


def init_db_pool() -> None:
    """
    Initializes the global MySQL connection pool.
    Called ONCE from app.py on_startup() — not during import.
    """
    global events_pool

    # ✅ Check that we do not initialize twice
    if events_pool is not None:
        logger.warning("init_db_pool: pool already exists, skipping.")
        return

    try:
        events_pool = pooling.MySQLConnectionPool(
            pool_name=POOL_NAME,
            pool_size=POOL_SIZE,
            **DB_CONFIG,
        )
        logger.info(
            "DB connection pool created: name=%s size=%s host=%s db=%s",
            POOL_NAME,
            POOL_SIZE,
            DB_CONFIG.get("host"),
            DB_CONFIG.get("database"),
        )
    except MySQLError as exc:
        logger.error("Failed to create connection pool: %s", exc)
        events_pool = None



def get_connection():
    # ✅ Only one pool — events_pool
    if events_pool is None:
        logger.error(
            "get_connection: events_pool is None. "
            "Was init_db_pool() called in on_startup()?"
        )
        return None
    try:
        return events_pool.get_connection()
    except MySQLError as e:
        logger.error("get_connection: pool error: %s", e)
        return None


# ---- 2) Event INSERT ----

def insert_event(
    stored: Dict[str, Any],
    ui_rep: float,
    onchain_rep: float,
    combined_rep: float,
    bonus_local: float,
    cluster_bonus: float,
) -> None:
    """
    Inserts one event into the `events` table.

    Mapped 1:1 to the MySQL schema you provided:
    - source_reputation_ui / source_reputation_onchain
    - ui_reputation / onchain_reputation / combined_reputation
    - bonus_local, cluster_bonus
    - stake, trust_score, etc.
    """
    global events_pool

    ev_hash = stored.get("event_hash") or None
    event_hash=ev_hash

    if events_pool is None:
        #print("[DB] insert_event: events_pool is None, skipping insert.")
        logger.warning("insert_event: events_pool is None, skip the insert.") 
        return

    # prepare fields from the stored dict
    event_id = stored.get("event_id")
    quadrant_id = stored.get("quadrant_id")
    subcell_id = stored.get("subcell_id")
    h3_resolution = stored.get("h3_resolution")

    lat = stored.get("lat")
    lon = stored.get("lon")

    kind = stored.get("kind")
    ts = stored.get("timestamp")
    description = stored.get("description")

    topic_tags = stored.get("topic_tags") or []
    topic_tags_str = json.dumps(topic_tags, ensure_ascii=False) if isinstance(topic_tags, list) else str(topic_tags)

    source_wallet = stored.get("source_wallet")
    stake = stored.get("stake")
    trust_score = stored.get("trust_score")
    vehicle_id = stored.get("vehicle_id")
    route_id = stored.get("route_id")
    delay_minutes = stored.get("delay_minutes")
    severity = stored.get("severity")

    raw_payload = json.dumps(stored, ensure_ascii=False, default=str)

    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        sql = """
        INSERT INTO events (
            event_id,
            event_hash,
            quadrant_id,
            lat,
            lon,
            subcell_id,
            h3_resolution,
            kind,
            timestamp,
            description,
            topic_tags,
            source_wallet,
            source_reputation_ui,
            source_reputation_onchain,
            ui_reputation,
            onchain_reputation,
            combined_reputation,
            bonus_local,
            cluster_bonus,
            stake,
            trust_score,
            vehicle_id,
            route_id,
            delay_minutes,
            severity,
            raw_payload
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s
        )
        """

        values = (
            event_id,
            event_hash,
            quadrant_id,
            lat,
            lon,
            subcell_id,
            h3_resolution,
            kind,
            ts,
            description,
            topic_tags_str,
            source_wallet,
            float(ui_rep) if ui_rep is not None else None,
            float(onchain_rep) if onchain_rep is not None else None,
            float(ui_rep) if ui_rep is not None else None,
            float(onchain_rep) if onchain_rep is not None else None,
            float(combined_rep) if combined_rep is not None else None,
            float(bonus_local) if bonus_local is not None else None,
            float(cluster_bonus) if cluster_bonus is not None else None,
            stake,
            trust_score,
            vehicle_id,
            route_id,
            delay_minutes,
            severity,
            raw_payload,
        )

        cursor.execute(sql, values)
        conn.commit()
    except MySQLError as exc:
        #print(f"[DB] insert_event error: {exc}")
        logger.error("insert_event error: %s", exc)
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

def update_event_moderation(
    event_id: str,
    moderation_status: str,
    moderation_reason: Optional[str],
    moderator_wallet: Optional[str],
) -> int:
    conn = get_connection()
    if conn is None:
        #print("[DB] update_event_moderation: no connection")
        logger.warning("update_event_moderation: no database connection.")
        return 0

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE events
            SET moderation_status = %s,
                moderation_reason = %s,
                moderated_by_wallet = %s,
                moderated_at = NOW()
            WHERE event_id = %s
            """,
            (moderation_status, moderation_reason, moderator_wallet, event_id),
        )
        conn.commit()
        return int(cur.rowcount or 0)
    except MySQLError as exc:
        #print(f"[DB] update_event_moderation error: {exc}")
        logger.error("Update_event_moderation error: %s", exc)
        return 0
    finally:
        try:
            if cur: cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def get_event_topic_tags(event_id: str) -> List[str]:
    global events_pool
    if events_pool is None:
        return []

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT topic_tags FROM events WHERE event_id = %s", (event_id,))
        row = cursor.fetchone()
        if not row or row[0] is None:
            return []
        raw = row[0]
        if isinstance(raw, str) and raw.strip():
            try:
                data = json.loads(raw)
                return data if isinstance(data, list) else []
            except Exception:
                return []
        return []
    except MySQLError as exc:
        #print(f"[DB] get_event_topic_tags error: {exc}")
        logger.error("get_event_topic_tags error: %s", exc)
        return []
    finally:
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            if conn: conn.close()
        except Exception:
            pass


def update_event_topic_tags(event_id: str, topic_tags: List[str]) -> int:
    global events_pool
    if events_pool is None:
        return 0

    tags_str = json.dumps(topic_tags or [], ensure_ascii=False)
    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE events
            SET topic_tags = %s
            WHERE event_id = %s
            """,
            (tags_str, event_id),
        )
        conn.commit()
        return int(cursor.rowcount or 0)
    except MySQLError as exc:
        #print(f"[DB] update_event_topic_tags error: {exc}")
        logger.error("update_event_topic_tags error: %s", exc)
        return 0
    finally:
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            if conn: conn.close()
        except Exception:
            pass



def get_permissions_for_wallet(wallet_address: str) -> List[Dict[str, Any]]:
    """
    Return all permissions for the given wallet from the `fft_quadrant_permissions` table.

    Return value format (list of dicts):
    [
      {
        "wallet_address": "...",
        "quadrant_id": "GLOBAL" or e.g. "Q_-80_-100",
        "permission": "system_admin" or "quadrant_editor", etc.,
        "created_at": <datetime>
      },
      ...
    ]
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_permissions_for_wallet: events_pool is None, returning [].")
        logger.warning("get_permissions_for_wallet: events_pool is None, return [].")
        return []

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        # dictionary=True so we get a dict instead of a tuple
        cursor = conn.cursor(dictionary=True)

        sql = """
        SELECT
            wallet_address,
            quadrant_id,
            permission,
            created_at
        FROM fft_quadrant_permissions
        WHERE wallet_address = %s
        """

        cursor.execute(sql, (wallet_address,))
        rows = cursor.fetchall() or []

        # You could return rows directly, but I map them explicitly:
        perms: List[Dict[str, Any]] = []
        for row in rows:
            perms.append(
                {
                    "wallet_address": row.get("wallet_address"),
                    "quadrant_id": row.get("quadrant_id"),
                    "permission": row.get("permission"),
                    "created_at": row.get("created_at"),
                }
            )
        return perms

    except MySQLError as exc:
        #print(f"[DB] get_permissions_for_wallet error: {exc}")
        logger.error("get_permissions_for_wallet error: %s", exc)
        return []
    finally:
        try:
            if cursor is not None:
                cursor.close()
        except Exception:
            pass
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass


def get_event_quadrant(event_id: str) -> Optional[str]:
    """
    Return quadrant_id for the given event_id, or None if it does not exist.
    Used for the permission check during moderation.
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_event_quadrant: events_pool is None")
        logger.warning("get_event_quadrant: events_pool is None")
        return None

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT quadrant_id FROM events WHERE event_id = %s",
            (event_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return row[0]
    except MySQLError as exc:
        #print(f"[DB] get_event_quadrant error: {exc}")
        logger.error("get_event_quadrant error: %s", exc)
        return None
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


# Function for updating quadrant metadata
def update_quadrant_meta(
    quadrant_id: str,
    short_description: Optional[str] = None,
    quadrant_tags: Optional[List[str]] = None,
    quadrant_category: Optional[str] = None,
    local_rating: Optional[int] = None,
) -> bool:
    """
    Partial update of quadrant metadata:
    - short_description
    - quadrant_tags (list[str] -> JSON)
    - quadrant_category
    - local_rating (int 0–5)
    """
    global events_pool

    if events_pool is None:
        #print("[DB] update_quadrant_meta: events_pool is None, skipping.")
        logger.warning("update_quadrant_meta: events_pool is None")
        return False

    fields = []
    values = []

    if short_description is not None:
        fields.append("short_description = %s")
        values.append(short_description)

    if quadrant_tags is not None:
        tags_str = json.dumps(quadrant_tags, ensure_ascii=False)
        fields.append("quadrant_tags = %s")
        values.append(tags_str)

    if quadrant_category is not None:
        fields.append("quadrant_category = %s")
        values.append(quadrant_category)

    if local_rating is not None:
        fields.append("local_rating = %s")
        values.append(local_rating)

    if not fields:
        #print("[DB] update_quadrant_meta: no fields to update.")
        logger.warning("update_quadrant_meta: no update fields provided. Skipping.")
        return False

    # always update updated_at
    fields.append("updated_at = NOW()")

    values.append(quadrant_id)

    sql = f"""
        UPDATE quadrants_l0
        SET {", ".join(fields)}
        WHERE quadrant_id = %s
    """

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(sql, tuple(values))
        conn.commit()
        return (cursor.rowcount or 0) > 0
    except MySQLError as exc:
        #print(f"[DB] update_quadrant_meta error: {exc}")
        logger.error("update_quadrant_meta error: %s", exc)
        return False
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass




def get_quadrant_meta(quadrant_id: str) -> Optional[Dict[str, Any]]:
    """
    Return quadrant metadata from quadrants_l0:
    - quadrant_id
    - short_description
    - quadrant_tags (list[str])
    - quadrant_category
    - local_rating
    - region_type, owner_wallet, ipfs_cid, created_at, updated_at
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_quadrant_meta: events_pool is None.")
        logger.warning("get_quadrant_meta: events_pool is None.")
        return None

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                quadrant_id,
                short_description,
                quadrant_tags,
                quadrant_category,
                local_rating,
                region_type,
                owner_wallet,
                ipfs_cid,
                created_at,
                updated_at
            FROM quadrants_l0
            WHERE quadrant_id = %s
            """,
            (quadrant_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        raw_tags = row.get("quadrant_tags")
        if raw_tags:
            try:
                row["quadrant_tags"] = json.loads(raw_tags)
            except Exception:
                row["quadrant_tags"] = []
        else:
            row["quadrant_tags"] = []

        return row
    except MySQLError as exc:
        #print(f"[DB] get_quadrant_meta error: {exc}")
        logger.error("get_quadrant_meta error: %s", exc)
        return None
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass







# ---- 3) USER / ROLE HELPERS ----

def get_or_create_user_by_wallet(wallet_address: str,
                                 display_name: Optional[str] = None) -> Optional[int]:
    """
    Return the user_id for the given wallet_address.
    If the user does not exist, create a new row in fft_users.

    Canonical table: fft_users(wallet_address).
    """
    if not wallet_address:
        return None

    addr = wallet_address.strip()
    if not addr:
        return None

    conn = get_connection()
    if conn is None:
        logger.error("[DB] get_or_create_user_by_wallet: no connection")
        return None

    try:
        cur = conn.cursor()
        # 1) Try to find an existing user
        cur.execute(
            """
            SELECT id
            FROM fft_users
            WHERE wallet_address = %s
            """,
            (addr,),
        )
        row = cur.fetchone()
        if row:
            return int(row[0])

        # 2) Create a new one
        cur.execute(
            """
            INSERT INTO fft_users (wallet_address, display_name, is_active)
            VALUES (%s, %s, 1)
            """,
            (addr, display_name),
        )
        conn.commit()
        return cur.lastrowid

    except MySQLError as exc:
        logger.error("[DB] get_or_create_user_by_wallet error: %s", exc)
        return None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def get_user_roles_for_wallet(wallet_address: str) -> List[str]:
    """
    Return the list of role_code values for the given wallet address.
    If there is no user or no roles, return [].
    """
    if not wallet_address:
        return []

    addr = wallet_address.strip()
    if not addr:
        return []

    conn = get_connection()
    if conn is None:
        logger.error("[DB] get_user_roles_for_wallet: no connection")
        return []

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.role_code
            FROM fft_users u
            JOIN fft_user_roles r ON r.user_id = u.id
            WHERE u.wallet_address = %s
            """,
            (addr,),
        )
        roles: List[str] = [row[0] for row in cur.fetchall()]
        return roles
    except MySQLError as exc:
        logger.error("[DB] get_user_roles_for_wallet error: %s", exc)
        return []
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def get_quadrant_permissions_for_wallet(wallet_address: str,
                                        quadrant_id: str) -> List[str]:
    """
    Return the list of permission strings (e.g. ['editor', 'viewer']) that
    the given wallet has for quadrant_id.
    If there are none → [].
    """
    if not wallet_address or not quadrant_id:
        return []

    addr = wallet_address.strip()
    quad = quadrant_id.strip()
    if not addr or not quad:
        return []

    conn = get_connection()
    if conn is None:
        logger.error("[DB] get_quadrant_permissions_for_wallet: no connection")
        return []

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT qp.permission
            FROM fft_users u
            JOIN fft_quadrant_permissions qp ON qp.user_id = u.id
            WHERE u.wallet_address = %s
              AND qp.quadrant_id = %s
            """,
            (addr, quad),
        )
        perms: List[str] = [row[0] for row in cur.fetchall()]
        return perms
    except MySQLError as exc:
        logger.error("[DB] get_quadrant_permissions_for_wallet error: %s", exc)
        return []
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass



def list_events_paginated(
    quadrant_id: Optional[str] = None,
    route_id: Optional[str] = None,
    source_wallet: Optional[str] = None,
    min_trust: Optional[float] = None,
    limit: int = 20,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Returns a page of events from the `events` table with basic filters.

    Return format:
    {
        "items": [ { ...row from the table... }, ... ],
        "total": <total number of rows matching WHERE>,
        "limit": <limit>,
        "offset": <offset>
    }
    """
    global events_pool

    if events_pool is None:
        #print("[DB] list_events_paginated: events_pool is None")
        logger.warning(" list_events_paginated: events_pool is None")
        return {"items": [], "total": 0, "limit": limit, "offset": offset}

    conn = None
    cursor = None

    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor(dictionary=True)

        where_clauses = []
        where_params: list[Any] = []

        if quadrant_id:
            where_clauses.append("quadrant_id = %s")
            where_params.append(str(quadrant_id))

        if route_id:
            where_clauses.append("route_id = %s")
            where_params.append(str(route_id))

        if source_wallet:
            where_clauses.append("source_wallet = %s")
            where_params.append(str(source_wallet))

        if min_trust is not None:
            where_clauses.append("trust_score >= %s")
            where_params.append(float(min_trust))

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        # 1) total count for paging
        count_sql = f"SELECT COUNT(*) AS total FROM events{where_sql}"
        cursor.execute(count_sql, where_params)
        row = cursor.fetchone()
        total = int(row["total"]) if row and "total" in row else 0

        # 2) actual data for this page
        select_sql = f"""
            SELECT
                id,
                event_id,
                quadrant_id,
                subcell_id,
                h3_resolution,
                kind,
                timestamp,
                description,
                topic_tags,
                source_wallet,
                source_reputation_ui,
                source_reputation_onchain,
                ui_reputation,
                onchain_reputation,
                combined_reputation,
                bonus_local,
                cluster_bonus,
                stake,
                trust_score,
                vehicle_id,
                route_id,
                delay_minutes,
                severity,
                raw_payload,
                created_at
            FROM events
            {where_sql}
            ORDER BY timestamp DESC
            LIMIT %s OFFSET %s
        """

        list_params = list(where_params) + [int(limit), int(offset)]
        cursor.execute(select_sql, list_params)
        rows = cursor.fetchall() or []

        # decode topic_tags from JSON text into a list (if stored that way)
        for r in rows:
            tt = r.get("topic_tags")
            if isinstance(tt, str) and tt.strip():
                try:
                    r["topic_tags"] = json.loads(tt)
                except Exception:
                    # if it is not valid JSON, leave the string as-is
                    pass

        return {
            "items": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except MySQLError as exc:
        #print(f"[DB] list_events_paginated error: {exc}")
        logger.error("list_events_paginated error: %s", exc)
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()



# ---- 3) Statistics by quadrant ----

def get_quadrant_stats(
    window_seconds: int = 0,
) -> List[Dict[str, Any]]:
    """
    Returns statistics by quadrant:
      - quadrant_id
      - event_count
      - avg_trust
      - last_event_ts  ✅ added

    window_seconds: if > 0, filters only events within that window.
    Example: window_seconds=10800 → last 3 hours.
    """
    conn = get_connection()
    if conn is None:
        logger.warning("get_quadrant_stats: no connection, returning [].")
        return []

    rows: List[Dict[str, Any]] = []
    cursor = None

    try:
        cursor = conn.cursor(dictionary=True)

        # ✅ Optional time filter
        if window_seconds > 0:
            where_clause = (
                f"WHERE timestamp >= UNIX_TIMESTAMP(NOW()) - {int(window_seconds)}"
            )
        else:
            where_clause = ""

        sql = f"""
            SELECT
                quadrant_id,
                COUNT(*) AS event_count,
                AVG(trust_score) AS avg_trust,
                COALESCE(MAX(timestamp), 0) AS last_event_ts
            FROM events
            {where_clause}
            GROUP BY quadrant_id
            ORDER BY event_count DESC
        """

        cursor.execute(sql)

        for row in cursor:
            rows.append(
                {
                    "quadrant_id": row["quadrant_id"],
                    "event_count": int(row["event_count"] or 0),
                    "avg_trust": float(row["avg_trust"] or 0.0),
                    "last_event_ts": int(row["last_event_ts"] or 0),  # ✅ added
                }
            )

    except MySQLError as e:
        logger.error("get_quadrant_stats error: %s", e)
        return []
    finally:
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    return rows



def insert_gcd_ledger_entry(
    wallet_address: str,
    amount: float,
    entry_type: str,
    event_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Atomic insert into gcd_ledger.
    balance_after is calculated directly in SQL — no race condition.
    """
    global events_pool

    if events_pool is None:
        logger.warning("insert_gcd_ledger_entry: events_pool is None, skipping INSERT.")
        return

    # ✅ Prepare metadata JSON outside the connection
    meta_json = None
    if metadata is not None:
        try:
            meta_json = json.dumps(metadata, ensure_ascii=False, default=str)
        except Exception as exc:
            logger.error("JSON dump metadata error: %s", exc)
            meta_json = None

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        # ✅ Atomic INSERT — balance_after is calculated in the SQL subquery
        # No SELECT + Python calculation + INSERT sequence
        # The entire operation is a single SQL statement
        sql_insert = """
        INSERT INTO gcd_ledger (
            wallet_address,
            event_id,
            entry_type,
            amount,
            balance_after,
            metadata
        ) VALUES (
            %s,
            %s,
            %s,
            %s,
            (
                SELECT COALESCE(SUM(gl.amount), 0) + %s
                FROM gcd_ledger AS gl
                WHERE gl.wallet_address = %s
            ),
            %s
        )
        """

        # ✅ amount appears twice:
        #    - once as the actual amount in the column
        #    - once in the subquery for calculating balance_after
        values = (
            wallet_address,    # wallet_address column
            event_id,          # event_id column
            entry_type,        # entry_type column
            float(amount),     # amount column
            float(amount),     # amount in the subquery (SUM + new amount)
            wallet_address,    # wallet_address in the subquery WHERE
            meta_json,         # metadata column
        )

        cursor.execute(sql_insert, values)
        conn.commit()

        logger.debug(
            "GCD ledger entry: wallet=%s entry_type=%s amount=%s",
            wallet_address, entry_type, amount
        )

    except MySQLError as exc:
        logger.error("insert_gcd_ledger_entry error: %s", exc)
    finally:
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            if conn: conn.close()
        except Exception:
            pass




def get_event_basic_info(event_id: str) -> Optional[Dict[str, Any]]:
    """
    Returns basic event data needed for slashing/rewards:
      - source_wallet
      - stake
      - trust_score
      - quadrant_id
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_event_basic_info: events_pool is None")
        logger.warning("get_event_basic_info: events_pool is None")
        return None

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor(dictionary=True)

        sql = """
        SELECT
            event_id,
            source_wallet,
            stake,
            trust_score,
            quadrant_id
        FROM events
        WHERE event_id = %s
        """

        cursor.execute(sql, (event_id,))
        row = cursor.fetchone()
        return row
    except MySQLError as exc:
        #print(f"[DB] get_event_basic_info error: {exc}")
        logger.error("get_event_basic_info error:%s". exc)
        return None
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def get_gcd_balance(wallet_address: str) -> float:
    """
    Returns the sum of amount values from gcd_ledger for the given wallet_address.
    If there are no rows or the pool is None -> 0.0
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_gcd_balance: events_pool is None, returning 0.0.")
        logger.warning("get_gcd_balance: events_pool is None, return 0.0.")
        return 0.0

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        sql = """
        SELECT COALESCE(SUM(amount), 0)
        FROM gcd_ledger
        WHERE wallet_address = %s
        """
        cursor.execute(sql, (wallet_address,))
        row = cursor.fetchone()
        total = row[0] if row and row[0] is not None else 0.0

        total_f = float(total)
        #print(f"[GCD DEBUG] get_gcd_balance({wallet_address}) -> {total_f}")
        logger.debug("get_gcd_balance(%s) -> %s", wallet_address, total_f)
        return total_f
    except MySQLError as exc:
        #print(f"[DB] get_gcd_balance error: {exc}")
        logger.error("get_gcd_balance error: %s", exc)
        return 0.0
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass



def get_event_proof(event_id: str) -> Optional[Dict[str, Any]]:
    if events_pool is None:
        logger.warning("get_event_proof: events_pool is None.")
        return None

    # ✅ Input validation
    if not event_id or not event_id.strip():
        logger.warning("get_event_proof: event_id is empty.")
        return None

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT event_id, event_hash, source_wallet, quadrant_id, timestamp
            FROM events
            WHERE event_id = %s
            LIMIT 1
            """,
            (event_id.strip(),),
        )
        return cursor.fetchone()  # ✅ returns None if it does not exist

    except MySQLError as exc:
        # ✅ Catches all MySQL errors — connection timeout, query error, etc.
        logger.error("get_event_proof error for event_id=%s: %s", event_id, exc)
        return None

    finally:
        # ✅ Cleanup is always executed
        try:
            if cursor: cursor.close()
        except Exception:
            pass
        try:
            if conn: conn.close()
        except Exception:
            pass


def get_gcd_event_rewards_today(wallet_address: str) -> Tuple[int, float]:
    """
    Return (event_count, reward_sum) for the given wallet for today (last 24h).
    Used for a soft anti-farming limiter.
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_gcd_event_rewards_today: events_pool is None, returning (0, 0.0).")
        logger.warning("get_gcd_event_rewards_today: events_pool is None, return (0, 0.0).")
        return 0, 0.0

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        sql = """
        SELECT
            COUNT(*) AS cnt,
            COALESCE(SUM(amount), 0) AS total_amount
        FROM gcd_ledger
        WHERE wallet_address = %s
          AND entry_type = 'event_reward'
          AND created_at >= NOW() - INTERVAL 1 DAY
        """

        cursor.execute(sql, (wallet_address,))
        row = cursor.fetchone() or (0, 0.0)
        cnt = int(row[0])
        total = float(row[1])
        #print(f"[GCD DEBUG] get_gcd_event_rewards_today({wallet_address}) -> cnt={cnt}, total={total}")
        logger.debug("get_gcd_event_rewards_today(%s) -> cnt = %s total=%s", wallet_address, cnt, total) 
        return cnt, total
    except MySQLError as exc:
        #print(f"[DB] get_gcd_event_rewards_today error: {exc}")
        logger.error("get_gcd_event_rewards_today error: %s", exc)
        return 0, 0.0
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

def get_events_today_for_wallet(wallet_address: str) -> int:
    """
    Return how many events have already been recorded today (by server date)
    for the given source_wallet in the events table.

    If a DB error occurs, return 0 (do not break the API because of a metric).
    """
    if not wallet_address:
        return 0

    global events_pool
    if events_pool is None:
        #print("[DB] get_events_today_for_wallet: events_pool is None.")
        logger.warning("get_events_today_for_wallet: events_pool is None.")
        return 0

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        # Assumption: the 'events' table has a created_at TIMESTAMP column
        # If it does not, you can use FROM_UNIXTIME(timestamp) instead of created_at >= CURDATE().
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM events
            WHERE source_wallet = %s
              AND created_at >= CURDATE()
            """,
            (wallet_address,),
        )
        row = cursor.fetchone()
        return int(row[0]) if row and row[0] is not None else 0

    except MySQLError as exc:
        #print(f"[DB] get_events_today_for_wallet error: {exc}")
        logger.error("get_events_today_for_wallet error:%s", exc)
        return 0
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass


def get_gcd_event_reward_and_slash(wallet_address: str, event_id: str) -> Tuple[float, float]:
    """
    For the given wallet + event_id, returns:
      - total_reward: sum of event_reward amounts (positive number)
      - total_slash: total already-applied penalty (as a positive number, even though amount is negative in the table)

    Used to calculate how much can/should still be slashed.
    """
    global events_pool

    if events_pool is None:
        #print("[DB] get_gcd_event_reward_and_slash: events_pool is None, returning (0.0, 0.0).")
        logger.warning("get_gcd_event_reward_and_slash: events_pool is None, return (0.0, 0.0).")
        return 0.0, 0.0

    conn = None
    cursor = None
    try:
        conn = events_pool.get_connection()
        cursor = conn.cursor()

        sql = """
        SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'event_reward' THEN amount ELSE 0 END), 0) AS total_reward,
            COALESCE(SUM(CASE WHEN entry_type = 'slash_penalty' THEN -amount ELSE 0 END), 0) AS total_slash
        FROM gcd_ledger
        WHERE wallet_address = %s
          AND event_id = %s
        """

        cursor.execute(sql, (wallet_address, event_id))
        row = cursor.fetchone() or (0, 0)
        total_reward = float(row[0] or 0.0)
        total_slash = float(row[1] or 0.0)

        #print(
        #    f"[GCD DEBUG] get_gcd_event_reward_and_slash({wallet_address}, {event_id}) "
        #    f"-> total_reward={total_reward}, total_slash={total_slash}"
        #)
        logger.debug( "get_gcd_event_reward_and_slash(%s, %s) -> total_reward=%s total_slash=%s", wallet_address, event_id, total_reward, total_slash )
        return total_reward, total_slash
    except MySQLError as exc:
        print(f"[DB] get_gcd_event_reward_and_slash error: {exc}")
        logger.warning("get_gcd_event_reward_and_slash error: %s", exc)
        return 0.0, 0.0
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass




# --- AUTH NONCES ---


def auth_create_nonce(
    wallet_address: str,
    nonce: str,
    ttl_sec: int,
    ip: Optional[str] = None,
    ua: Optional[str] = None,
) -> bool:
    """
    Creates a nonce in the database.
    Returns True if successful, False if the DB is unavailable or an error occurs.
    app.py should check the return value.
    """
    conn = get_connection()
    if conn is None:
        # ✅ logger instead of RuntimeError
        logger.error(
            "auth_create_nonce: DB connection is not available for wallet=%s",
            wallet_address,
        )
        return False  # ✅ returns False instead of failing

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO fft_auth_nonces
                (wallet_address, nonce, expires_at, used_ip, user_agent)
            VALUES
                (%s, %s, NOW() + INTERVAL %s SECOND, %s, %s)
            """,
            (wallet_address, nonce, int(ttl_sec), ip, ua),
        )
        conn.commit()
        return True  # ✅ explicitly confirms success

    except MySQLError as exc:
        # ✅ catches MySQL errors (duplicate nonce, constraint violation, etc.)
        logger.error(
            "auth_create_nonce error for wallet=%s: %s",
            wallet_address, exc,
        )
        return False

    finally:
        try:
            if cur: cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def auth_get_valid_nonce(wallet_address: str, nonce: str) -> Optional[Dict[str, Any]]:
    """
    Return the nonce row if it exists, has not expired, and has not been used.
    """
    conn = get_connection()
    if conn is None:
        return None

    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, wallet_address, nonce, issued_at, expires_at, used_at
            FROM fft_auth_nonces
            WHERE wallet_address = %s
              AND nonce = %s
              AND used_at IS NULL
              AND expires_at > NOW()
            LIMIT 1
            """,
            (wallet_address, nonce),
        )
        return cur.fetchone()
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def auth_mark_nonce_used(
    row_id: int,
    ip: Optional[str] = None,
) -> bool:
    """
    Marks a nonce as used (anti-replay protection).
    Returns True if successful, False if the DB is unavailable or an error occurs.
    """
    conn = get_connection()
    if conn is None:
        logger.error(
            "auth_mark_nonce_used: DB connection is not available for row_id=%s",
            row_id,
        )
        return False  # ✅ returns False instead of failing

    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE fft_auth_nonces
            SET used_at = NOW(),
                used_ip = COALESCE(%s, used_ip)
            WHERE id = %s
            """,
            (ip, int(row_id)),
        )
        conn.commit()

        # ✅ Check that the row was actually updated
        if cur.rowcount == 0:
            logger.warning(
                "auth_mark_nonce_used: nonce row_id=%s was not found or was already marked.",
                row_id,
            )
            return False

        return True  # ✅

    except MySQLError as exc:
        logger.error(
            "auth_mark_nonce_used error for row_id=%s: %s",
            row_id, exc,
        )
        return False

    finally:
        try:
            if cur: cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def auth_cleanup_old_nonces(days: int = 7) -> int:
    """
    Optional: delete old nonces.
    """
    conn = get_connection()
    if conn is None:
        return 0
    try:
        cur = conn.cursor()
        cur.execute(
            """
            DELETE FROM fft_auth_nonces
            WHERE issued_at < NOW() - INTERVAL %s DAY
            """,
            (int(days),),
        )
        conn.commit()
        return cur.rowcount or 0
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

# ----- QUADRANTS MINTED / INDEXER STATE ----- 
def list_quadrants_minted(limit: int = 5000, offset: int = 0) -> Dict[str, Any]:
    """
    Returns a page from `quadrants_minted`:
    {
      "items": [{"token_id": "...", "minted_block": 123, "owner_wallet": "..."}],
      "total": 123,
      "limit": limit,
      "offset": offset
    }
    """
    conn = get_connection()
    if conn is None:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}

    cur = None
    try:
        cur = conn.cursor(dictionary=True)

        # total
        cur.execute("SELECT COUNT(*) AS total FROM quadrants_minted")
        row = cur.fetchone() or {}
        total = int(row.get("total") or 0)

        # page
        cur.execute(
            """
            SELECT
              token_id,
              minted_block,
              owner_wallet,
              tx_hash,
              log_index,
              resolution,
              cell_id,
              lat,
              lon,
              created_at,
              updated_at
            FROM quadrants_minted
            ORDER BY minted_block DESC, id DESC
            LIMIT %s OFFSET %s
            """,
            (int(limit), int(offset)),
        )
        items = cur.fetchall() or []
        # token_id is DECIMAL -> in the dict it may come as Decimal; convert it to str
        for it in items:
            if it.get("token_id") is not None:
                it["token_id"] = str(it["token_id"])
            if it.get("cell_id") is not None:
                it["cell_id"] = str(it["cell_id"])
        return {"items": items, "total": total, "limit": limit, "offset": offset}
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def get_quadrants_indexer_state() -> Dict[str, Any]:
    """
    Reads one row (id=1) from quadrants_indexer_state.
    Returns:
      {"last_scanned_block": int, "last_run_at": ..., "last_error": ...}
    """
    conn = get_connection()
    if conn is None:
        return {"last_scanned_block": 0, "last_run_at": None, "last_error": "DB connection not available"}

    cur = None
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT last_scanned_block, last_run_at, last_error, updated_at
            FROM quadrants_indexer_state
            WHERE id = 1
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            return {"last_scanned_block": 0, "last_run_at": None, "last_error": "missing state row (id=1)"}
        row["last_scanned_block"] = int(row.get("last_scanned_block") or 0)
        return row
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def set_quadrants_indexer_state(
    *,
    last_scanned_block: int,
    last_error: Optional[str] = None,
) -> None:
    conn = get_connection()
    if conn is None:
        return
    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE quadrants_indexer_state
            SET last_scanned_block=%s,
                last_run_at=NOW(),
                last_error=%s
            WHERE id=1
            """,
            (int(last_scanned_block), last_error),
        )
        conn.commit()
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def upsert_quadrant_minted(
    *,
    token_id: str,
    minted_block: int,
    tx_hash: str,
    log_index: int,
    owner_wallet: Optional[str] = None,
    resolution: Optional[int] = None,
    cell_id: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> None:
    """
    Insert into quadrants_minted with idempotency.
    - token_id is UNIQUE
    - (tx_hash, log_index) is UNIQUE
    """
    conn = get_connection()
    if conn is None:
        return
    cur = None
    try:
        cur = conn.cursor()

        # INSERT ... ON DUPLICATE KEY: token_id duplicate -> only refresh owner/meta
        # keep the smallest minted_block (first mint)
        cur.execute(
            """
            INSERT INTO quadrants_minted (
              token_id, minted_block, tx_hash, log_index, owner_wallet,
              resolution, cell_id, lat, lon
            ) VALUES (
              %s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            ON DUPLICATE KEY UPDATE
              minted_block = LEAST(minted_block, VALUES(minted_block)),
              owner_wallet = COALESCE(VALUES(owner_wallet), owner_wallet),
              resolution = COALESCE(VALUES(resolution), resolution),
              cell_id = COALESCE(VALUES(cell_id), cell_id),
              lat = COALESCE(VALUES(lat), lat),
              lon = COALESCE(VALUES(lon), lon),
              updated_at = NOW()
            """,
            (
                token_id,
                int(minted_block),
                tx_hash,
                int(log_index),
                owner_wallet,
                int(resolution) if resolution is not None else None,
                cell_id,
                float(lat) if lat is not None else None,
                float(lon) if lon is not None else None,
            ),
        )
        conn.commit()
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

