"""GraphHopper routing client.

Returns real road paths when GRAPHHOPPER_API_KEY is set; otherwise returns []
so the caller can fall back to straight-line sampling.

This version is more aggressive about route alternatives:

1. First asks GraphHopper for alternative routes.
2. If GraphHopper returns only one route, it creates extra real routes by
   routing through generated via-points around the direct line.

This keeps the UI closer to Google Maps: fastest / safest / alternative routes.
"""

from __future__ import annotations

import math
import os
import sys
from typing import List, Optional, Tuple, TypedDict

import httpx


GRAPHHOPPER_URL = "https://graphhopper.com/api/1/route"
GRAPHHOPPER_TIMEOUT = float(os.getenv("GRAPHHOPPER_TIMEOUT_SECONDS", "2.0"))
ENABLE_VIA_FALLBACKS = os.getenv("FLOODWATCH_ROUTE_DEEP_ALTERNATIVES", "").lower() in {
    "1",
    "true",
    "yes",
}


Point = Tuple[float, float]  # (lat, lng)
TravelMode = str

GRAPHHOPPER_VEHICLES = {
    "motorbike": "car",
    "car": "car",
    "walk": "foot",
    "bicycle": "bike",
    # GraphHopper's public route API does not provide schedule-based transit.
    # Use car geometry as a conservative fallback while the UI labels it clearly.
    "transit": "car",
}


class RoadRoute(TypedDict):
    points: List[Point]
    distance_m: float
    time_ms: int
    streets: List[str]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0

    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )

    return 2 * radius_km * math.asin(math.sqrt(a))


def _is_duplicate_route(candidate: RoadRoute, existing: List[RoadRoute]) -> bool:
    """Detect near-duplicate route geometry.

    Alternative routing often returns routes that are technically different but
    visually almost identical. We reject those so the UI does not show duplicate
    cards.
    """

    if not existing:
        return False

    c_points = candidate["points"]
    c_mid = c_points[len(c_points) // 2]

    for route in existing:
        points = route["points"]
        mid = points[len(points) // 2]

        distance_gap_m = abs(candidate["distance_m"] - route["distance_m"])
        time_gap_ms = abs(candidate["time_ms"] - route["time_ms"])
        mid_gap_km = _haversine_km(c_mid[0], c_mid[1], mid[0], mid[1])

        if distance_gap_m < 120 and time_gap_ms < 90_000:
            return True

        if mid_gap_km < 0.25 and distance_gap_m < 500:
            return True

    return False


def _append_unique_route(routes: List[RoadRoute], candidate: RoadRoute, max_paths: int) -> None:
    if len(routes) >= max_paths:
        return

    if _is_duplicate_route(candidate, routes):
        return

    routes.append(candidate)


def _via_point(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    fraction: float,
    offset_km: float,
) -> Point:
    """Generate a via-point to the side of the origin-destination line.

    This is a controlled fallback when GraphHopper only returns one route.
    It asks GraphHopper to route through a real nearby point, so the returned
    path is still a real road route.
    """

    mid_lat = from_lat + (to_lat - from_lat) * fraction
    mid_lng = from_lng + (to_lng - from_lng) * fraction

    avg_lat_rad = math.radians((from_lat + to_lat) / 2)
    km_per_lat_degree = 111.0
    km_per_lng_degree = max(20.0, 111.0 * math.cos(avg_lat_rad))

    x1 = from_lng * km_per_lng_degree
    y1 = from_lat * km_per_lat_degree
    x2 = to_lng * km_per_lng_degree
    y2 = to_lat * km_per_lat_degree

    vx = x2 - x1
    vy = y2 - y1
    length = math.hypot(vx, vy)

    if length < 0.001:
        return mid_lat, mid_lng

    # Perpendicular vector.
    px = -vy / length
    py = vx / length

    mid_x = mid_lng * km_per_lng_degree
    mid_y = mid_lat * km_per_lat_degree

    via_x = mid_x + px * offset_km
    via_y = mid_y + py * offset_km

    via_lat = via_y / km_per_lat_degree
    via_lng = via_x / km_per_lng_degree

    return via_lat, via_lng


def _candidate_via_points(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> List[Point]:
    distance_km = _haversine_km(from_lat, from_lng, to_lat, to_lng)

    # Small enough to stay near the city route, large enough to force
    # GraphHopper to choose a different corridor.
    base_offset = min(3.5, max(1.0, distance_km * 0.20))

    return [
        _via_point(from_lat, from_lng, to_lat, to_lng, 0.45, base_offset),
        _via_point(from_lat, from_lng, to_lat, to_lng, 0.45, -base_offset),
        _via_point(from_lat, from_lng, to_lat, to_lng, 0.60, base_offset * 1.25),
        _via_point(from_lat, from_lng, to_lat, to_lng, 0.35, -base_offset * 1.25),
    ]


async def _request_graphhopper_routes(
    points: List[Point],
    *,
    use_alternative_algorithm: bool,
    max_paths: int,
    travel_mode: TravelMode,
) -> List[RoadRoute]:
    api_key = os.getenv("GRAPHHOPPER_API_KEY", "").strip()

    if not api_key:
        print("[graphhopper] GRAPHHOPPER_API_KEY not set — falling back", file=sys.stderr)
        return []

    params: List[Tuple[str, str]] = []

    for lat, lng in points:
        params.append(("point", f"{lat},{lng}"))

    params.extend(
        [
            ("vehicle", GRAPHHOPPER_VEHICLES.get(travel_mode, "car")),
            ("points_encoded", "false"),
            ("instructions", "true"),
            ("calc_points", "true"),
            ("key", api_key),
        ]
    )

    if use_alternative_algorithm and max_paths > 1:
        params.extend(
            [
                ("algorithm", "alternative_route"),
                ("alternative_route.max_paths", str(max_paths)),

                # More permissive than GraphHopper defaults.
                # Defaults are 1.4 and 0.6. These often return only one
                # route in dense HCMC corridors.
                ("alternative_route.max_weight_factor", "2.0"),
                ("alternative_route.max_share_factor", "0.85"),
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

    out: List[RoadRoute] = []

    for path in paths:
        coords = (path.get("points") or {}).get("coordinates") or []

        if len(coords) < 2:
            continue

        # GraphHopper returns [lng, lat]. FloodWatch uses (lat, lng).
        route_points: List[Point] = [(float(c[1]), float(c[0])) for c in coords]
        streets: List[str] = []

        for instruction in path.get("instructions") or []:
            street_name = str(instruction.get("street_name") or "").strip()

            if not street_name:
                continue

            if street_name.lower() in {"road", "street", "unknown"}:
                continue

            if street_name not in streets:
                streets.append(street_name)

        out.append(
            {
                "points": route_points,
                "distance_m": float(path.get("distance", 0.0)),
                "time_ms": int(path.get("time", 0)),
                "streets": streets[:6],
            }
        )

    return out


async def fetch_road_route(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
) -> Optional[RoadRoute]:
    routes = await fetch_road_routes(from_lat, from_lng, to_lat, to_lng, max_paths=1)
    return routes[0] if routes else None


async def fetch_road_routes(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    max_paths: int = 3,
    travel_mode: TravelMode = "motorbike",
) -> List[RoadRoute]:
    """Return up to max_paths real road routes.

    GraphHopper's alternative_route algorithm may legally return fewer than
    max_paths. To keep FloodWatch useful, this function adds via-point fallback
    routes when needed.
    """

    max_paths = max(1, min(int(max_paths), 4))

    routes: List[RoadRoute] = []

    # 1. Ask GraphHopper for normal alternatives first.
    normal_routes = await _request_graphhopper_routes(
        [(from_lat, from_lng), (to_lat, to_lng)],
        use_alternative_algorithm=(max_paths > 1),
        max_paths=max_paths,
        travel_mode=travel_mode,
    )

    for route in normal_routes:
        _append_unique_route(routes, route, max_paths)

    # 2. Optional deeper search. This costs extra network round-trips and is
    # disabled by default so mobile route checks stay under the 3s UX budget.
    if ENABLE_VIA_FALLBACKS and len(routes) < max_paths:
        for via_lat, via_lng in _candidate_via_points(from_lat, from_lng, to_lat, to_lng):
            via_routes = await _request_graphhopper_routes(
                [(from_lat, from_lng), (via_lat, via_lng), (to_lat, to_lng)],
                use_alternative_algorithm=False,
                max_paths=1,
                travel_mode=travel_mode,
            )

            for route in via_routes:
                _append_unique_route(routes, route, max_paths)

            if len(routes) >= max_paths:
                break

    routes.sort(key=lambda r: r["time_ms"])

    print(
        f"[graphhopper] OK — {len(routes)} route(s); "
        + ", ".join(
            f"{r['distance_m'] / 1000:.2f}km/{r['time_ms'] / 60000:.1f}min"
            for r in routes
        ),
        file=sys.stderr,
    )

    return routes[:max_paths]


def sample_route_points(
    points: List[Point],
    n_segments: int = 6,
) -> List[Tuple[Point, Point, List[Point]]]:
    """Split a polyline into n_segments chunks.

    Returns a list of (start_point, end_point, full_chunk_points) tuples so the
    caller can both score the segment and draw the real road geometry.
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
