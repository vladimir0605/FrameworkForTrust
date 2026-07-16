# /backend/quadrants_init.py
"""
One-time (or idempotent) script for populating the L0 grid into the quadrants_l0 table.

- Generates all 10x10° quadrants from lat = -80..80, lon = -180..170
- Plus two polar "quadrants": Q_90_0 and Q_-90_0
- quadrant_id format: Q_LAT_LON  (e.g. Q_0_0, Q_-80_-120, Q_90_0)
- region_type is set very roughly (Polar / Ocean / Unknown) as a placeholder —
  can be refined later manually or via a better map/script.
"""

import sys
import mysql.connector
from mysql.connector import errorcode

# Assumes DB_CONFIG is already defined in db.py
from db import DB_CONFIG


def infer_region_type(lat: int, lon: int) -> str:
    """
    Rough classification so not everything is 'Unknown'.
    Feel free to update the logic later or run an update via a better map.
    """
    # Polar zones (but not the poles themselves)
    if abs(lat) >= 70:
        return "Polar"

    # Near the equator — often ocean, but also land; this is just a placeholder
    if abs(lat) <= 10:
        return "Ocean"

    # Everything else is treated as Unknown for now
    return "Unknown"


def ensure_table(cursor):
    """
    Creates quadrants_l0 if it does not already exist.
    Safe to run if the table was created manually — will not overwrite anything.
    """
    create_sql = """
    CREATE TABLE IF NOT EXISTS quadrants_l0 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quadrant_id VARCHAR(32) NOT NULL UNIQUE,
        lat INT NOT NULL,
        lon INT NOT NULL,
        region_type VARCHAR(32) DEFAULT 'Unknown',
        env_hint VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lat_lon (lat, lon)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    cursor.execute(create_sql)


def insert_quadrant(cursor, quadrant_id: str, lat: int, lon: int, region_type: str):
    """
    Inserts one row; if it already exists (UNIQUE constraint on quadrant_id),
    INSERT IGNORE prevents duplication.
    """
    sql = """
        INSERT IGNORE INTO quadrants_l0 (quadrant_id, lat, lon, region_type)
        VALUES (%s, %s, %s, %s)
    """
    cursor.execute(sql, (quadrant_id, lat, lon, region_type))


def main():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print("[DB] Connection error:", err)
        if err.errno == errorcode.ER_ACCESS_DENIED_ERROR:
            print("    ➜ Check username/password in DB_CONFIG or env vars (FFT_DB_...).")
        elif err.errno == errorcode.ER_BAD_DB_ERROR:
            print("    ➜ Database does not exist — create it first (e.g. CREATE DATABASE fft_db;).")
        sys.exit(1)

    cursor = conn.cursor()

    try:
        ensure_table(cursor)

        created = 0

        # 1) All regular L0 quadrants: lat -80..80, lon -180..170 (step 10)
        for lat in range(-80, 81, 10):        # -80, -70, ..., 70, 80
            for lon in range(-180, 180, 10):  # -180, -170, ..., 170
                quadrant_id = f"Q_{lat}_{lon}"
                region_type = infer_region_type(lat, lon)
                insert_quadrant(cursor, quadrant_id, lat, lon, region_type)
                created += 1

        # 2) Two special polar quadrants (already used on the map):
        #    Q_90_0 (North Pole) and Q_-90_0 (South Pole)
        insert_quadrant(cursor, "Q_90_0", 90, 0, "Polar")
        created += 1

        insert_quadrant(cursor, "Q_-90_0", -90, 0, "Polar")
        created += 1

        conn.commit()
        print(f"[OK] L0 initialisation complete. Attempted insert for {created} quadrants.")
        print("    (Duplicates ignored via INSERT IGNORE + UNIQUE on quadrant_id.)")

    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
