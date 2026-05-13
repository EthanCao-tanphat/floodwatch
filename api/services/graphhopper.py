"""GraphHopper routing client.

Returns real road paths when GRAPHHOPPER_API_KEY is set; otherwise returns None
so the caller can fall back to straight-line sampling.

Logs every failure to stderr so they show up in uvicorn output — no more silent
fall-throughs.
"""
import os
import sys
from typing import List, Optional, Tuple, TypedDict
import httpx

GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route"
GRAPHHOPPER_TIMEOUT = 8.0  # seconds


class RoadRoute(TypedDict):
    points: List[Tuple[float, float]]  # [(lat, lng), ...]
    distance_m: float
    time_ms: int


async def fetch_road_route(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> Optional[RoadRoute]:
    """Call GraphHopper. Return None on any failure so caller can fall back."""
    api_key = os.getenv("GRAPHHOPPER_API_KEY", "").strip()
    if not api_key:
        print("[graphhopper] GRAPHHOPPER_API_KEY not set — falling back to straight line", file=sys.stderr)
        return None

    # Free tier supports car/foot/bike. NOT motorcycle (paid only).
    # Use car as the closest match for Vietnamese motorbike road behavior.
    params = [
        ("point", f"{from_lat},{from_lng}"),
        ("point", f"{to_lat},{to_lng}"),
        ("vehicle", "car"),
        ("points_encoded", "false"),
        ("instructions", "false"),
        ("calc_points", "true"),
        ("key", api_key),
    ]

    try:
        async with httpx.AsyncClient(timeout=GRAPHHOPPER_TIMEOUT) as client:
            resp = await client.get(GRAPHHOPPER_URL, params=params)
    except Exception as e:
        print(f"[graphhopper] Request error: {e}", file=sys.stderr)
        return None

    if resp.status_code != 200:
        print(f"[graphhopper] HTTP {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
        return None

    try:
        data = resp.json()
    except Exception as e:
        print(f"[graphhopper] Bad JSON: {e}", file=sys.stderr)
        return None

    paths = data.get("paths") or []
    if not paths:
        print(f"[graphhopper] Empty paths in response: {data}", file=sys.stderr)
        return None

    path = paths[0]
    coords = (path.get("points") or {}).get("coordinates") or []
    if len(coords) < 2:
        print(f"[graphhopper] Path has <2 coords: {coords}", file=sys.stderr)
        return None

    # GraphHopper returns [lng, lat] — flip to (lat, lng) for internal use
    points: List[Tuple[float, float]] = [(c[1], c[0]) for c in coords]

    print(
        f"[graphhopper] OK — {len(points)} points, "
        f"{path.get('distance', 0)/1000:.2f}km, "
        f"{path.get('time', 0)/60000:.1f}min",
        file=sys.stderr,
    )

    return {
        "points": points,
        "distance_m": float(path.get("distance", 0.0)),
        "time_ms": int(path.get("time", 0)),
    }


def sample_route_points(
    points: List[Tuple[float, float]], n_segments: int = 6
) -> List[Tuple[Tuple[float, float], Tuple[float, float], List[Tuple[float, float]]]]:
    """Split a polyline into n_segments chunks.

    Returns a list of (start_point, end_point, full_chunk_points) tuples so the
    caller can both score the segment AND draw the real road geometry for it.
    """
    if len(points) < 2:
        return []

    if n_segments < 1:
        n_segments = 1

    # If polyline is shorter than requested segments, just use consecutive pairs
    if len(points) <= n_segments + 1:
        return [
            (points[i], points[i + 1], [points[i], points[i + 1]])
            for i in range(len(points) - 1)
        ]

    # Otherwise divide indices evenly
    out = []
    chunk_size = (len(points) - 1) / n_segments
    for i in range(n_segments):
        start_idx = int(round(i * chunk_size))
        end_idx = int(round((i + 1) * chunk_size))
        if i == n_segments - 1:
            end_idx = len(points) - 1
        if end_idx <= start_idx:
            end_idx = start_idx + 1
        chunk = points[start_idx : end_idx + 1]
        out.append((points[start_idx], points[end_idx], chunk))
    return out