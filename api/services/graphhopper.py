"""GraphHopper routing client.

Returns real road paths when GRAPHHOPPER_API_KEY is set; otherwise returns None
so the caller can fall back to straight-line sampling.

Now supports alternative routes — asks GraphHopper for up to N paths so the
route agent can pick the safest one, not just the fastest.

Logs every failure to stderr so they show up in uvicorn output.
"""
import os
import sys
from typing import List, Optional, Tuple, TypedDict
import httpx

GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route"
GRAPHHOPPER_TIMEOUT = 12.0  # alternative-route requests are slower


class RoadRoute(TypedDict):
    points: List[Tuple[float, float]]  # [(lat, lng), ...]
    distance_m: float
    time_ms: int


# Back-compat single-route fetcher (unused by route.py after this patch, but
# kept in case other call sites import it).
async def fetch_road_route(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> Optional[RoadRoute]:
    routes = await fetch_road_routes(from_lat, from_lng, to_lat, to_lng, max_paths=1)
    return routes[0] if routes else None


async def fetch_road_routes(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    max_paths: int = 3,
) -> List[RoadRoute]:
    """Call GraphHopper asking for multiple alternative routes.

    Returns up to `max_paths` road routes (sorted fastest-first by GraphHopper).
    Returns [] on any failure so the caller can fall back to straight-line.
    """
    api_key = os.getenv("GRAPHHOPPER_API_KEY", "").strip()
    if not api_key:
        print("[graphhopper] GRAPHHOPPER_API_KEY not set — falling back", file=sys.stderr)
        return []

    # Free tier supports car/foot/bike. NOT motorcycle (paid only).
    # Car ≈ motorbike road behavior in Vietnamese cities.
    params: List[Tuple[str, str]] = [
        ("point", f"{from_lat},{from_lng}"),
        ("point", f"{to_lat},{to_lng}"),
        ("vehicle", "car"),
        ("points_encoded", "false"),
        ("instructions", "false"),
        ("calc_points", "true"),
        ("key", api_key),
    ]

    # Ask for alternatives only when we want more than 1 path.
    if max_paths > 1:
        params.extend(
            [
                ("algorithm", "alternative_route"),
                ("alternative_route.max_paths", str(max_paths)),
                # Alternates can be up to 1.4x longer than fastest
                ("alternative_route.max_weight_factor", "1.4"),
                # Alternates share at most 60% of the fastest path
                ("alternative_route.max_share_factor", "0.6"),
            ]
        )

    try:
        async with httpx.AsyncClient(timeout=GRAPHHOPPER_TIMEOUT) as client:
            resp = await client.get(GRAPHHOPPER_URL, params=params)
    except Exception as e:
        print(f"[graphhopper] Request error: {e}", file=sys.stderr)
        return []

    if resp.status_code != 200:
        print(
            f"[graphhopper] HTTP {resp.status_code}: {resp.text[:300]}",
            file=sys.stderr,
        )
        return []

    try:
        data = resp.json()
    except Exception as e:
        print(f"[graphhopper] Bad JSON: {e}", file=sys.stderr)
        return []

    paths = data.get("paths") or []
    if not paths:
        print(f"[graphhopper] Empty paths in response", file=sys.stderr)
        return []

    out: List[RoadRoute] = []
    for path in paths:
        coords = (path.get("points") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        # GraphHopper returns [lng, lat] — flip to (lat, lng) for internal use
        points: List[Tuple[float, float]] = [(c[1], c[0]) for c in coords]
        out.append(
            {
                "points": points,
                "distance_m": float(path.get("distance", 0.0)),
                "time_ms": int(path.get("time", 0)),
            }
        )

    print(
        f"[graphhopper] OK — {len(out)} route(s); "
        + ", ".join(
            f"{r['distance_m']/1000:.2f}km/{r['time_ms']/60000:.1f}min" for r in out
        ),
        file=sys.stderr,
    )
    return out


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

    if len(points) <= n_segments + 1:
        return [
            (points[i], points[i + 1], [points[i], points[i + 1]])
            for i in range(len(points) - 1)
        ]

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