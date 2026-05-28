"""FloodWatch place search service.

Provider order:
1. Google Places Autocomplete
2. Local HCMC aliases
3. Nominatim fallback

The frontend should call:
- GET  /api/search/suggest
- POST /api/search/resolve

Google key stays server-side.
"""

from __future__ import annotations
import asyncio
import hashlib
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from services.geocode import _local_results, geocode_address


GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places"

DEFAULT_HCMC_LAT = 10.7769
DEFAULT_HCMC_LNG = 106.7009

GOOGLE_PLACES_BIAS_RADIUS_M = min(
    50000,
    max(1, int(os.getenv("GOOGLE_PLACES_BIAS_RADIUS_M", "30000"))),
)
SEARCH_LANGUAGE_CODE = os.getenv("SEARCH_LANGUAGE_CODE", "vi")


def _google_key() -> str:
    key = (
        os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
        or os.getenv("GOOGLE_PLACES_API_KEY", "").strip()
    )

    return key

GOOGLE_TIMEOUT_SECONDS = float(os.getenv("GOOGLE_PLACES_TIMEOUT_SECONDS", "2.8"))
NOMINATIM_TIMEOUT_SECONDS = float(os.getenv("SEARCH_NOMINATIM_TIMEOUT_SECONDS", "3.5"))

# For live autocomplete, keep Nominatim off by default.
# It is too slow for every keystroke.
ENABLE_NOMINATIM_AUTOCOMPLETE = (
    os.getenv("ENABLE_NOMINATIM_AUTOCOMPLETE", "0").strip() == "1"
)


def _split_title_subtitle(label: str) -> Tuple[str, str]:
    parts = [part.strip() for part in label.split(",") if part.strip()]

    if not parts:
        return label.strip(), ""

    title = parts[0]
    subtitle = ", ".join(parts[1:4])

    return title, subtitle


def _embedded_place_id(provider: str, lat: float, lng: float, label: str) -> str:
    raw = f"{provider}:{lat:.6f}:{lng:.6f}:{label}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    return f"{provider}:{lat:.6f},{lng:.6f}:{digest}"


def _parse_embedded_place_id(place_id: str) -> Optional[Tuple[float, float]]:
    match = re.match(
        r"^[a-z_]+:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?):",
        place_id,
    )

    if not match:
        return None

    try:
        return float(match.group(1)), float(match.group(2))
    except ValueError:
        return None


def _make_coord_suggestion(
    *,
    provider: str,
    label: str,
    lat: float,
    lng: float,
    source: str,
) -> Dict[str, Any]:
    title, subtitle = _split_title_subtitle(label)

    return {
        "place_id": _embedded_place_id(provider, lat, lng, label),
        "provider": provider,
        "title": title,
        "subtitle": subtitle,
        "description": label,
        "lat": float(lat),
        "lng": float(lng),
        "needs_resolve": False,
        "source": source,
    }


def _dedupe_suggestions(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []

    for item in items:
        lat = item.get("lat")
        lng = item.get("lng")

        if lat is not None and lng is not None:
            key = f"{float(lat):.5f},{float(lng):.5f}"
        else:
            key = f"{item.get('provider')}:{item.get('place_id')}"

        title_key = (
            item.get("title", "").strip().lower(),
            item.get("subtitle", "").strip().lower(),
        )

        if key in seen or title_key in seen:
            continue

        seen.add(key)
        seen.add(title_key)
        out.append(item)

    return out

async def _with_timeout(coro, seconds: float, label: str):
    try:
        return await asyncio.wait_for(coro, timeout=seconds)
    except asyncio.TimeoutError:
        print(f"[search] {label} timed out after {seconds}s")
        return []
    except Exception as exc:
        print(f"[search] {label} failed: {exc}")
        return []

async def _google_suggestions(
    query: str,
    *,
    limit: int,
    lat: Optional[float],
    lng: Optional[float],
    session_token: Optional[str],
) -> List[Dict[str, Any]]:
    api_key = _google_key()

    if not api_key:
        print("[search] Google skipped: GOOGLE_MAPS_API_KEY is not configured")
        return []

    center_lat = float(lat if lat is not None else DEFAULT_HCMC_LAT)
    center_lng = float(lng if lng is not None else DEFAULT_HCMC_LNG)

    body: Dict[str, Any] = {
        "input": query,
        "includedRegionCodes": ["vn"],
        "languageCode": SEARCH_LANGUAGE_CODE,
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": center_lat,
                    "longitude": center_lng,
                },
                "radius": GOOGLE_PLACES_BIAS_RADIUS_M,
            }
        },
    }

    if session_token:
        body["sessionToken"] = session_token

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "suggestions.placePrediction.placeId,"
            "suggestions.placePrediction.text.text"
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                GOOGLE_AUTOCOMPLETE_URL,
                json=body,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        print(f"[search] Google autocomplete failed for query={query!r}: {exc}")
        return []

    suggestions: List[Dict[str, Any]] = []

    for item in data.get("suggestions", []):
        prediction = item.get("placePrediction")

        if not prediction:
            continue

        place_id = prediction.get("placeId")
        label = (
            prediction.get("text", {}).get("text")
            or prediction.get("structuredFormat", {})
            .get("mainText", {})
            .get("text")
            or ""
        ).strip()

        if not place_id or not label:
            continue

        title, subtitle = _split_title_subtitle(label)

        suggestions.append(
            {
                "place_id": place_id,
                "provider": "google",
                "title": title,
                "subtitle": subtitle,
                "description": label,
                "lat": None,
                "lng": None,
                "needs_resolve": True,
                "source": "google_places_autocomplete",
            }
        )

    return suggestions[:limit]


def _local_suggestions(query: str, limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    for item in _local_results(query, limit):
        out.append(
            _make_coord_suggestion(
                provider="local",
                label=item["label"],
                lat=float(item["lat"]),
                lng=float(item["lng"]),
                source=item.get("source", "local_hcmc_alias"),
            )
        )

    return out


async def _nominatim_suggestions(query: str, limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    try:
        results = await geocode_address(query, limit=limit)
    except Exception as exc:
        print(f"[search] Nominatim fallback failed: {exc}")
        return []

    for item in results:
        source = item.get("source", "nominatim")

        # Local aliases are handled before this. Avoid duplicate local results.
        provider = "local" if source == "local_hcmc_alias" else "nominatim"

        out.append(
            _make_coord_suggestion(
                provider=provider,
                label=item["label"],
                lat=float(item["lat"]),
                lng=float(item["lng"]),
                source=source,
            )
        )

    return out


async def suggest_places(
    query: str,
    *,
    limit: int = 7,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    session_token: Optional[str] = None,
    allow_nominatim: bool = False,
) -> List[Dict[str, Any]]:
    query = query.strip()
    limit = max(1, min(int(limit), 8))

    if len(query) < 2:
        return []

    suggestions: List[Dict[str, Any]] = []

    # 1. Local aliases are instant. Always run them.
    local = _local_suggestions(query, limit=limit)

    # 2. Google is best quality, but must be short-timeout.
    google = await _with_timeout(
        _google_suggestions(
            query,
            limit=limit,
            lat=lat,
            lng=lng,
            session_token=session_token,
        ),
        GOOGLE_TIMEOUT_SECONDS,
        "Google Places autocomplete",
    )

    # Put Google first, then local.
    suggestions.extend(google)
    suggestions.extend(local)

    # 3. Nominatim is slow. Only use when explicitly allowed.
    should_use_nominatim = allow_nominatim or ENABLE_NOMINATIM_AUTOCOMPLETE

    if should_use_nominatim and len(suggestions) < limit:
        nominatim = await _with_timeout(
            _nominatim_suggestions(query, limit=limit),
            NOMINATIM_TIMEOUT_SECONDS,
            "Nominatim autocomplete",
        )
        suggestions.extend(nominatim)

    return _dedupe_suggestions(suggestions)[:limit]


async def _resolve_google_place(
    place_id: str,
    *,
    session_token: Optional[str],
) -> Dict[str, Any]:
    api_key = _google_key()

    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured.")

    clean_place_id = place_id.replace("places/", "").strip()

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    }

    params: Dict[str, str] = {}

    if session_token:
        params["sessionToken"] = session_token

    url = f"{GOOGLE_PLACE_DETAILS_URL}/{clean_place_id}"

    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

    location = data.get("location") or {}
    lat = location.get("latitude")
    lng = location.get("longitude")

    if lat is None or lng is None:
        raise RuntimeError("Google Place Details did not return a location.")

    title = (data.get("displayName") or {}).get("text") or "Selected place"
    subtitle = data.get("formattedAddress") or ""
    label = subtitle if subtitle else title

    return {
        "place_id": data.get("id") or clean_place_id,
        "provider": "google",
        "title": title,
        "subtitle": subtitle,
        "label": label,
        "lat": float(lat),
        "lng": float(lng),
        "source": "google_place_details",
    }


async def resolve_place(
    *,
    place_id: str,
    provider: str,
    title: str = "",
    subtitle: str = "",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    session_token: Optional[str] = None,
) -> Dict[str, Any]:
    if provider == "google":
        return await _resolve_google_place(
            place_id,
            session_token=session_token,
        )

    parsed = _parse_embedded_place_id(place_id)

    if parsed is not None:
        lat, lng = parsed

    if lat is None or lng is None:
        raise RuntimeError(f"Cannot resolve {provider} place without coordinates.")

    resolved_title = title or "Selected place"
    resolved_subtitle = subtitle or ""
    label = (
        f"{resolved_title}, {resolved_subtitle}"
        if resolved_subtitle
        else resolved_title
    )

    return {
        "place_id": place_id,
        "provider": provider,
        "title": resolved_title,
        "subtitle": resolved_subtitle,
        "label": label,
        "lat": float(lat),
        "lng": float(lng),
        "source": provider,
    }