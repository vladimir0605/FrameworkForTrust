"""
geo_grid.py — Framework for Trust (FFTrust) Geo indexing (Level 0 quadrants + subcells)

Level 0 (L0) = 10° × 10° blocks (quadrants)
    quadrant_id format:  Q_<lat0>_<lon0>
    where (lat0, lon0) is the SW corner of a 10° block.

Subcell layer = either:
    - H3 (recommended if you rely on neighbor rings):   H3R13:<h3_index>
    - S2 (recommended if you want quadtree hierarchy):  S2L21:<s2_token>

Optionally, you can attach a "micro offset" for sub-meter / subcell-local precision:
    dx_m = meters East from subcell center
    dy_m = meters North from subcell center

This file is dependency-light: H3 and S2 support are optional.
    pip install h3
    pip install s2sphere

If a dependency is missing, functions raise a clear ImportError with install hints.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Tuple, Dict, Any
import math
import re
import json

# ✅ Check H3 and S2 availability once at module import

try:
    import h3 as _h3
    H3_AVAILABLE = True
except ImportError:
    _h3 = None
    H3_AVAILABLE = False

try:
    from s2sphere import CellId as _S2CellId, LatLng as _S2LatLng
    S2_AVAILABLE = True
except ImportError:
    _S2CellId = None
    _S2LatLng = None
    S2_AVAILABLE = False


# ---------------------------
# Constants & helpers
# ---------------------------

EARTH_RADIUS_M = 6371008.8  # mean Earth radius in meters (good enough for small offsets)

QuadrantStepDeg = 10  # Level 0: 10° blocks

GRID_LAT_STEP_DEG = QuadrantStepDeg
GRID_LON_STEP_DEG = QuadrantStepDeg

DEFAULT_H3_RESOLUTION = 13   # H3 resolution 13 ≈ 3.6m edge length
DEFAULT_S2_LEVEL = 21         # S2 level 21 ≈ 3-5m edge length


def normalize_lon_deg(lon: float) -> float:
    """
    Normalize longitude to [-180, 180).
    """
    # Python's % works for negatives the way we want here.
    lon = (lon + 180.0) % 360.0 - 180.0
    # avoid returning 180.0 exactly; keep it in [-180,180)
    if lon == 180.0:
        lon = -180.0
    return lon


def clamp_lat_deg(lat: float) -> float:
    """
    Clamp latitude to the valid range [-90, 90].
    """
    return max(-90.0, min(90.0, lat))


def _bbox_fallback_subcell_id(lat: float, lon: float, resolution: int) -> str:
    """
    Fallback subcell_id based on a fine grid when H3/S2 are not available.

    Format: "BBOX:<lat_rounded>_<lon_rounded>_<res>"
    where lat/lon is rounded to N decimal places based on resolution.

    Not compatible with H3/S2 but ensures the system does not
    crash completely when a dependency is missing.
    """
    # Resolution 13 (H3) ≈ 3.6m ≈ 5 decimal places (±1m precision)
    # Resolution 7  (H3) ≈ 1.2km ≈ 2 decimal places
    # Map resolution to number of decimal places:
    decimals = max(1, min(6, resolution // 2))

    lat_r = round(lat, decimals)
    lon_r = round(lon, decimals)

    return f"BBOX:{lat_r}_{lon_r}_{resolution}"


def get_available_schemes() -> dict:
    """
    Returns which geo schemes are available on this server.
    Useful for the /health endpoint in app.py.
    """
    return {
        "h3": H3_AVAILABLE,
        "s2": S2_AVAILABLE,
        "fallback": "bbox",
    }


def floor_to_step(x: float, step: int) -> int:
    """
    Floor x to the nearest lower multiple of `step`.
    """
    return int(math.floor(x / step) * step)


# ---------------------------
# Level 0 quadrants (10° blocks)
# ---------------------------

_QUADRANT_RE = re.compile(r"^Q_(-?\d+)_(-?\d+)$")


def quadrant_id_from_latlon(lat: float, lon: float, step_deg: int = QuadrantStepDeg) -> str:
    """
    Convert (lat, lon) -> Level 0 quadrant_id for 10° blocks (or other step).

    Canonical mapping uses half-open intervals:
        lat in [lat0, lat0+step)
        lon in [lon0, lon0+step)

    Edge cases — SW corners:
        lat=-90  -> lat0=-90  (south pole)
        lat=90   -> lat0=80   (clamped: max block that fits)
        lat=89.9 -> lat0=80
        lon=-180 -> lon0=-180 (antimeridian west)
        lon=179.9 -> lon0=170 (clamped: max block that fits)
        lon=180  -> normalized to -180 -> lon0=-180

    Examples (step=10):
      >>> quadrant_id_from_latlon(19.9, 10.0)
      'Q_10_10'
      >>> quadrant_id_from_latlon(20.0, 10.0)
      'Q_20_10'
      >>> quadrant_id_from_latlon(-0.1, 3.0)
      'Q_-10_0'
      >>> quadrant_id_from_latlon(90.0, 0.0)
      'Q_80_0'
      >>> quadrant_id_from_latlon(-90.0, 0.0)
      'Q_-90_0'
      >>> quadrant_id_from_latlon(0.0, 180.0)
      'Q_0_-180'
      >>> quadrant_id_from_latlon(0.0, -180.0)
      'Q_0_-180'
      >>> quadrant_id_from_latlon(0.0, 179.9)
      'Q_0_170'
    """


    lat0 = floor_to_step(lat, step_deg)
    lon0 = floor_to_step(lon, step_deg)

    max_lat0 = 90 - step_deg   # e.g. 80 for step=10
    if lat0 > max_lat0:
        lat0 = max_lat0

    max_lon0 = 180 - step_deg  # e.g. 170 for step=10
    if lon0 > max_lon0:
        lon0 = max_lon0

    # ✅ Sanity check — these asserts should never fire
    # If they do, there is a bug in floor_to_step or clamping
    assert -90 <= lat0 <= 90 - step_deg, (
        f"lat0={lat0} out of bounds [-90, {90-step_deg}] "
        f"for input lat={lat}, step={step_deg}"
    )
    assert -180 <= lon0 <= 180 - step_deg, (
        f"lon0={lon0} out of bounds [-180, {180-step_deg}] "
        f"for input lon={lon}, step={step_deg}"
    )

    return f"Q_{lat0}_{lon0}"



def parse_quadrant_id(quadrant_id: str) -> Tuple[int, int]:
    """
    Parse Q_<lat0>_<lon0> -> (lat0, lon0) as ints.
    """
    m = _QUADRANT_RE.match(quadrant_id.strip())
    if not m:
        raise ValueError(f"Invalid quadrant_id '{quadrant_id}'. Expected format 'Q_<lat0>_<lon0>'.")
    return int(m.group(1)), int(m.group(2))


def validate_quadrant_id(quadrant_id: str, step_deg: int = QuadrantStepDeg) -> None:
    """
    Ensure quadrant_id is canonical for the chosen step size and within bounds.
    """
    lat0, lon0 = parse_quadrant_id(quadrant_id)

    if lat0 % step_deg != 0 or lon0 % step_deg != 0:
        raise ValueError(
            f"quadrant_id '{quadrant_id}' is not aligned to step={step_deg}°. "
            f"Expected multiples of {step_deg}."
        )

    if not (-90 <= lat0 <= 90 - step_deg):
        raise ValueError(
            f"quadrant_id '{quadrant_id}' has lat0={lat0} out of range [-90, {90-step_deg}]."
        )

    if not (-180 <= lon0 <= 180 - step_deg):
        raise ValueError(
            f"quadrant_id '{quadrant_id}' has lon0={lon0} out of range [-180, {180-step_deg}]."
        )


def quadrant_bounds(quadrant_id: str, step_deg: int = QuadrantStepDeg) -> Dict[str, float]:
    """
    Return the bounding box of the Level 0 quadrant as:
        { "lat_min", "lat_max", "lon_min", "lon_max" }
    """
    validate_quadrant_id(quadrant_id, step_deg=step_deg)
    lat0, lon0 = parse_quadrant_id(quadrant_id)
    return {
        "lat_min": float(lat0),
        "lat_max": float(lat0 + step_deg),
        "lon_min": float(lon0),
        "lon_max": float(lon0 + step_deg),
    }


# ---------------------------
# Subcells: H3 or S2 (optional deps)
# ---------------------------

SubcellScheme = Literal["h3", "s2"]


def subcell_id_from_latlon(
    lat: float,
    lon: float,
    scheme: SubcellScheme = "h3",
    *,
    h3_res: int = DEFAULT_H3_RESOLUTION,
    s2_level: int = DEFAULT_S2_LEVEL,
) -> str:
    """
    Compute a subcell_id string for the chosen grid scheme.

    Returns:
        - "H3R13:<index>"        if scheme="h3" and h3 is available
        - "S2L21:<token>"        if scheme="s2" and s2sphere is available
        - "BBOX:<lat>_<lon>_<res>" fallback if neither h3 nor s2 is available

    Raises:
        ValueError: if scheme is not 'h3' or 's2'
    """
    lat = clamp_lat_deg(lat)
    lon = normalize_lon_deg(lon)

    if scheme == "h3":
        # ✅ Use _h3 imported at module load
        if not H3_AVAILABLE or _h3 is None:
            # ✅ Fall back to bbox-based subcell instead of crashing
            import logging
            logging.getLogger(__name__).warning(
                "H3 not available (pip install h3). "
                "Using BBOX fallback for subcell_id."
            )
            return _bbox_fallback_subcell_id(lat, lon, h3_res)

        idx = _h3.latlng_to_cell(lat, lon, h3_res)
        return f"H3R{h3_res}:{idx}"

    if scheme == "s2":
        # ✅ Use _S2CellId imported at module load
        if not S2_AVAILABLE or _S2CellId is None:
            import logging
            logging.getLogger(__name__).warning(
                "s2sphere not available (pip install s2sphere). "
                "Using BBOX fallback for subcell_id."
            )
            return _bbox_fallback_subcell_id(lat, lon, s2_level)

        ll = _S2LatLng.from_degrees(lat, lon)
        cell = _S2CellId.from_lat_lng(ll).parent(s2_level)
        return f"S2L{s2_level}:{cell.to_token()}"

    raise ValueError(f"Unknown scheme '{scheme}'. Use 'h3' or 's2'.")



def subcell_center_latlon(subcell_id: str) -> Tuple[float, float]:
    """
    Return (center_lat, center_lon) for a given subcell_id.

    Supports:
      - H3R<res>:<index>       e.g. "H3R13:8d1e48912a9ffff"
      - S2L<level>:<token>     e.g. "S2L21:1234abcd"
      - BBOX:<lat>_<lon>_<res> e.g. "BBOX:43.85_18.41_13"  (fallback)

    Raises:
        TypeError:  if subcell_id is not a string
        ValueError: if the format is not recognised or is malformed
        ImportError: if the required library (h3/s2sphere) is not available
    """
    # ✅ Step 1 — type check
    if not isinstance(subcell_id, str):
        raise TypeError(
            f"subcell_id must be a string, got: {type(subcell_id).__name__!r}"
        )

    subcell_id = subcell_id.strip()

    # ✅ Step 2 — check not empty
    if not subcell_id:
        raise ValueError(
            "subcell_id must not be an empty string."
        )

    # ✅ Step 3 — check for ":" separator
    if ":" not in subcell_id:
        raise ValueError(
            f"Invalid subcell_id format: {subcell_id!r}. "
            "Expected format: 'H3R<res>:<index>', "
            "'S2L<level>:<token>', or 'BBOX:<lat>_<lon>_<res>'."
        )

    # ✅ Step 4 — H3 format
    if subcell_id.startswith("H3R"):
        if not H3_AVAILABLE or _h3 is None:
            raise ImportError(
                "H3 library not available. "
                "Install: pip install h3"
            )

        parts = subcell_id.split(":", 1)
        if len(parts) != 2 or not parts[1].strip():
            raise ValueError(
                f"Malformed H3 subcell_id: {subcell_id!r}. "
                "Expected 'H3R<res>:<h3_index>'."
            )

        idx = parts[1].strip()

        try:
            lat, lon = _h3.cell_to_latlng(idx)
        except Exception as exc:
            raise ValueError(
                f"Invalid H3 cell index {idx!r} in subcell_id {subcell_id!r}: {exc}"
            ) from exc

        lon = normalize_lon_deg(lon)
        return float(lat), float(lon)

    # ✅ Step 5 — S2 format
    if subcell_id.startswith("S2L"):
        if not S2_AVAILABLE or _S2CellId is None:
            raise ImportError(
                "s2sphere library not available. "
                "Install: pip install s2sphere"
            )

        parts = subcell_id.split(":", 1)
        if len(parts) != 2 or not parts[1].strip():
            raise ValueError(
                f"Malformed S2 subcell_id: {subcell_id!r}. "
                "Expected 'S2L<level>:<s2_token>'."
            )

        token = parts[1].strip()

        try:
            cell = _S2CellId.from_token(token)
            ll = cell.to_lat_lng()
            lat = ll.lat().degrees
            lon = normalize_lon_deg(ll.lng().degrees)
        except Exception as exc:
            raise ValueError(
                f"Invalid S2 token {token!r} in subcell_id {subcell_id!r}: {exc}"
            ) from exc

        return float(lat), float(lon)

    # ✅ Step 6 — BBOX fallback format
    if subcell_id.startswith("BBOX:"):
        _, coords = subcell_id.split(":", 1)
        parts = coords.split("_")

        if len(parts) < 2:
            raise ValueError(
                f"Malformed BBOX subcell_id: {subcell_id!r}. "
                "Expected 'BBOX:<lat>_<lon>_<res>'."
            )

        try:
            lat = float(parts[0])
            lon = float(parts[1])
        except (ValueError, IndexError) as exc:
            raise ValueError(
                f"Cannot parse lat/lon from BBOX subcell_id {subcell_id!r}: {exc}"
            ) from exc

        return clamp_lat_deg(lat), normalize_lon_deg(lon)

    # ✅ Step 7 — unknown format
    raise ValueError(
        f"Unsupported subcell_id format: {subcell_id!r}. "
        "Supported formats: "
        "'H3R<res>:<index>', "
        "'S2L<level>:<token>', "
        "'BBOX:<lat>_<lon>_<res>'."
    )



# ---------------------------
# Micro-offset (optional)
# ---------------------------

@dataclass(frozen=True)
class MicroOffset:
    """
    Small local offset from subcell center.
    dx_m: meters East (+) / West (-)
    dy_m: meters North (+) / South (-)
    """
    dx_m: float
    dy_m: float


def _normalize_lon_diff(delta_lon: float) -> float:
    """
    Normalises a longitude difference to the interval (-180, 180].

    Different from normalize_lon_deg which handles absolute longitude
    values. This function works with deltas.

    Examples:
        358.0  -> -2.0   (near antimeridian, right-to-left)
        -358.0 ->  2.0   (near antimeridian, left-to-right)
        180.0  -> 180.0  (exactly antimeridian)
        -180.0 -> 180.0  (equivalent)
    """
    # ✅ Normalise to (-180, 180]
    delta_lon = delta_lon % 360.0
    if delta_lon > 180.0:
        delta_lon -= 360.0
    return delta_lon


def micro_offset_from_center(
    lat: float,
    lon: float,
    center_lat: float,
    center_lon: float,
) -> MicroOffset:
    """
    Compute approximate local tangent-plane offset (dx, dy) in meters
    from (center_lat, center_lon) to (lat, lon).

    Handles antimeridian crossing correctly via _normalize_lon_diff.

    Good for meter-level and sub-meter offsets (equirectangular approx).
    """
    lat = clamp_lat_deg(lat)
    lon = normalize_lon_deg(lon)
    center_lat = clamp_lat_deg(center_lat)
    center_lon = normalize_lon_deg(center_lon)

    phi = math.radians(center_lat)
    dphi = math.radians(lat - center_lat)

    # ✅ Explicit longitude difference normalisation
    # Handles antimeridian crossing (e.g. lon=179, center=-179)
    delta_lon_deg = _normalize_lon_diff(lon - center_lon)
    dlambda = math.radians(delta_lon_deg)

    dy = EARTH_RADIUS_M * dphi
    dx = EARTH_RADIUS_M * math.cos(phi) * dlambda
    return MicroOffset(dx_m=float(dx), dy_m=float(dy))


# ---------------------------
# End-to-end indexing
# ---------------------------

@dataclass(frozen=True)
class GeoIndex:
    """
    Combined indexing output for an event.

    - quadrant_id: Level 0 10° block ID (NFT layer)
    - subcell_id:  meter-scale grid ID (S2/H3)
    - micro:       optional offset inside subcell (for extra precision / future-proofing)
    """
    quadrant_id: str
    subcell_id: str
    micro: Optional[MicroOffset] = None



def index_location(
    lat: float,
    lon: float,
    *,
    step_deg: int = QuadrantStepDeg,
    scheme: SubcellScheme = "h3",
    h3_res: int = DEFAULT_H3_RESOLUTION,
    s2_level: int = DEFAULT_S2_LEVEL,
    include_micro_offset: bool = False,
) -> GeoIndex:
    """
    Compute quadrant_id + subcell_id (and optionally micro offset) for a lat/lon.
    """
    qid = quadrant_id_from_latlon(lat, lon, step_deg=step_deg)
    sid = subcell_id_from_latlon(lat, lon, scheme=scheme, h3_res=h3_res, s2_level=s2_level)

    if not include_micro_offset:
        return GeoIndex(quadrant_id=qid, subcell_id=sid, micro=None)

    c_lat, c_lon = subcell_center_latlon(sid)
    micro = micro_offset_from_center(lat, lon, c_lat, c_lon)
    return GeoIndex(quadrant_id=qid, subcell_id=sid, micro=micro)


# ---------------------------
# Minimal CLI (optional)
# ---------------------------

def _cli() -> None:
    import argparse

    p = argparse.ArgumentParser(
        description="FFTrust geo indexing: L0 quadrants (10°) + subcells (H3/S2)."
    )
    p.add_argument("--lat", type=float)
    p.add_argument("--lon", type=float)
    p.add_argument("--scheme", choices=["h3", "s2"], default="h3")
    p.add_argument("--h3-res", type=int, default=DEFAULT_H3_RESOLUTION)
    p.add_argument("--s2-level", type=int, default=DEFAULT_S2_LEVEL)
    p.add_argument("--micro", action="store_true")

    # ✅ Add test flag
    p.add_argument(
        "--test",
        action="store_true",
        help="Run edge case tests and exit."
    )

    args = p.parse_args()

    # ✅ If --test flag is set, run tests and exit
    if args.test:
        print("Running edge case tests...\n")
        _run_edge_case_tests()
        return

    # Rest of CLI unchanged
    if args.lat is None or args.lon is None:
        p.error("--lat and --lon are required (unless --test is used)")

    gi = index_location(
        args.lat,
        args.lon,
        scheme=args.scheme,
        h3_res=args.h3_res,
        s2_level=args.s2_level,
        include_micro_offset=args.micro,
    )

    out = {
        "lat": args.lat,
        "lon": args.lon,
        "quadrant_id": gi.quadrant_id,
        "subcell_id": gi.subcell_id,
    }
    if gi.micro:
        out["micro"] = {"dx_m": gi.micro.dx_m, "dy_m": gi.micro.dy_m}

    print(json.dumps(out, ensure_ascii=False, indent=2))



def _run_edge_case_tests() -> None:
    """
    Quick smoke test for edge cases in quadrant_id_from_latlon.
    Run with: python geo_grid.py --test
    """
    tests = [
        # (lat, lon, expected_quadrant_id)
        # Normal cases:
        (19.9,   10.0,   "Q_10_10"),
        (20.0,   10.0,   "Q_20_10"),
        (-0.1,    3.0,   "Q_-10_0"),
        (0.0,     0.0,   "Q_0_0"),
        (45.5,  123.7,   "Q_40_120"),

        # Edge cases — lat:
        (90.0,    0.0,   "Q_80_0"),    # north pole → clamped to 80
        (-90.0,   0.0,   "Q_-90_0"),   # south pole → -90
        (89.99,   0.0,   "Q_80_0"),    # just below north pole
        (80.0,    0.0,   "Q_80_0"),    # exactly on boundary

        # Edge cases — lon:
        #(0.0,   180.0,   "Q_0_-180"),  # antimeridian → normalised to -180
        (0.0,  -180.0,   "Q_0_-180"),  # antimeridian west edge
        (0.0,   179.9,   "Q_0_170"),   # just below 180 → clamped to 170
        (0.0,   170.0,   "Q_0_170"),   # exactly at max_lon0
        (0.0,  -179.9,   "Q_0_-180"),  # just above -180
    ]

    passed = 0
    failed = 0

    for lat, lon, expected in tests:
        result = quadrant_id_from_latlon(lat, lon)
        if result == expected:
            print(f"  ✅ ({lat:8.2f}, {lon:8.2f}) → {result}")
            passed += 1
        else:
            print(f"  ❌ ({lat:8.2f}, {lon:8.2f}) → {result!r} (expected {expected!r})")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Result: {passed} passed, {failed} failed")

    if failed > 0:
        raise AssertionError(f"{failed} test(s) failed!")

    print("\n--- subcell_center_latlon validacija ---")

    import traceback

    invalid_inputs = [
        (None,         "TypeError"),
        ("",           "ValueError — empty string"),
        ("H3R13",      "ValueError — missing ':'"),
        ("H3R13:",     "ValueError — empty index"),
        ("H3R13:abc",  "ValueError — invalid H3 index"),
        ("NEPOZNAT:x", "ValueError — unknown format"),
        ("BBOX:abc_x_13", "ValueError — cannot parse lat/lon"),
    ]

    for inp, expected_error in invalid_inputs:
        try:
            subcell_center_latlon(inp)
            print(f"  ❌ {inp!r} should have raised {expected_error} but did not!")
            failed += 1
        except (TypeError, ValueError, ImportError) as exc:
            print(f"  ✅ {inp!r} → {type(exc).__name__}: {exc}")
            passed += 1
        except Exception as exc:
            print(f"  ⚠️  {inp!r} → Unexpected error: {type(exc).__name__}: {exc}")
            failed += 1


    print("\n--- micro_offset_from_center antimeridian testovi ---")

    antimeridian_tests = [
        # (lat, lon, center_lat, center_lon, opis, expected_dx_sign)
        # Same location → offset (0, 0):
        (43.0, 18.0,  43.0, 18.0,  "same point",      0.0, 0.0),

        # Moving East (dx > 0):
        (0.0,  10.0,   0.0,  0.0,  "East 10°",        "+", None),

        # Moving West (dx < 0):
        (0.0,  -10.0,  0.0,  0.0,  "West 10°",        "-", None),

        # Antimeridian — point East of a West-side centre:
        # lon=179, center=-179: point is 2° East of centre
        (0.0,  179.0,  0.0, -179.0, "antimeridian East",  "+", None),

        # Antimeridian — point West of an East-side centre:
        # lon=-179, center=179: point is 2° West of centre
        (0.0, -179.0,  0.0,  179.0, "antimeridian West",  "-", None),
    ]

    for lat, lon, clat, clon, label, expected_dx_sign, expected_dy in antimeridian_tests:
        result = micro_offset_from_center(lat, lon, clat, clon)
        dx = result.dx_m
        dy = result.dy_m

        if expected_dx_sign == 0.0:
            ok = abs(dx) < 0.01 and abs(dy) < 0.01
        elif expected_dx_sign == "+":
            ok = dx > 0
        elif expected_dx_sign == "-":
            ok = dx < 0
        else:
            ok = True

        status = "✅" if ok else "❌"
        print(f"  {status} {label}: dx={dx:.2f}m, dy={dy:.2f}m")



if __name__ == "__main__":
    _cli()
