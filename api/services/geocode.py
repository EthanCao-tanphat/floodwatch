"""Simple HCMC/Vietnam geocoding service.

Supports:
- Text place names: "Huynh Tan Phat, District 7"
- Vietnamese names without accents: "Vo Van Ngan, Thu Duc"
- Local demo road aliases first
- OpenStreetMap Nominatim fallback second

Reason:
Nominatim is not reliable for unaccented Vietnamese street names, so the
critical demo corridors use local aliases.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places"

HCMC_BIAS_CENTER = {
    "latitude": 10.7769,
    "longitude": 106.7009,
}

CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


LOCAL_PLACES: List[Dict[str, Any]] = [
    {
        "label": "Huynh Tan Phat, District 7, Ho Chi Minh City, Vietnam",
        "lat": 10.7376,
        "lng": 106.7245,
        "aliases": [
            "huynh tan phat",
            "huynh tan phat district 7",
            "huynh tan phat quan 7",
            "huỳnh tấn phát",
            "huỳnh tấn phát quận 7",
            "duong huynh tan phat",
            "đường huỳnh tấn phát",
            "d7 huynh tan phat",
            "district 7 huynh tan phat",
        ],
    },
    {
        "label": "Vo Van Ngan, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.8506,
        "lng": 106.7714,
        "aliases": [
            "vo van ngan",
            "vo van ngan thu duc",
            "võ văn ngân",
            "võ văn ngân thủ đức",
            "duong vo van ngan",
            "đường võ văn ngân",
            "thu duc vo van ngan",
        ],
    },
    {
        "label": "Nguyen Huu Canh, Binh Thanh, Ho Chi Minh City, Vietnam",
        "lat": 10.7905,
        "lng": 106.7178,
        "aliases": [
            "nguyen huu canh",
            "nguyen huu canh binh thanh",
            "nguyễn hữu cảnh",
            "nguyễn hữu cảnh bình thạnh",
        ],
    },
    {
        "label": "Nguyen Van Huong, Thao Dien, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.8124,
        "lng": 106.7361,
        "aliases": [
            "nguyen van huong",
            "nguyen van huong thao dien",
            "nguyễn văn hưởng",
            "nguyễn văn hưởng thảo điền",
        ],
    },
    {
        "label": "Mai Chi Tho, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.7897,
        "lng": 106.7494,
        "aliases": [
            "mai chi tho",
            "mai chi tho thu duc",
            "mai chí thọ",
            "mai chí thọ thủ đức",
        ],
    },
    {
        "label": "Luong Dinh Cua, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.7860,
        "lng": 106.7388,
        "aliases": [
            "luong dinh cua",
            "luong dinh cua thu duc",
            "lương định của",
            "lương định của thủ đức",
        ],
    },
    {
        "label": "Do Xuan Hop, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.8171,
        "lng": 106.7758,
        "aliases": [
            "do xuan hop",
            "do xuan hop thu duc",
            "đỗ xuân hợp",
            "đỗ xuân hợp thủ đức",
        ],
    },
    {
        "label": "Le Van Viet, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.8456,
        "lng": 106.7847,
        "aliases": [
            "le van viet",
            "le van viet thu duc",
            "lê văn việt",
            "lê văn việt thủ đức",
        ],
    },
    {
        "label": "Pham Van Dong, Ho Chi Minh City, Vietnam",
        "lat": 10.8235,
        "lng": 106.7235,
        "aliases": [
            "pham van dong",
            "pham van dong hcmc",
            "phạm văn đồng",
        ],
    },
        {
        "label": "Dai hoc Van Hien, Ho Chi Minh City, Vietnam",
        "lat": 10.7315,
        "lng": 106.6861,
        "aliases": [
            "dai hoc van hien",
            "đại học văn hiến",
            "van hien university",
            "truong dai hoc van hien",
            "trường đại học văn hiến",
        ],
    },
        {
        "label": "Vincom Mega Mall Thao Dien, Thu Duc, Ho Chi Minh City, Vietnam",
        "lat": 10.8022,
        "lng": 106.7419,
        "aliases": [
            "vincom thao dien",
            "vincom thảo điền",
            "vincom mega mall thao dien",
            "vincom mega mall thảo điền",
            "vincom thu duc",
            "vincom thủ đức",
        ],
    },
    {
        "label": "Thu Duc City, Ho Chi Minh City, Vietnam",
        "lat": 10.8495,
        "lng": 106.7737,
        "aliases": [
            "thu duc",
            "thu duc city",
            "thủ đức",
            "thành phố thủ đức",
        ],
    },
]


def _normalize(text: str) -> str:
    """Lowercase, remove accents, remove punctuation."""

    no_accents = unicodedata.normalize("NFD", text)
    no_accents = "".join(ch for ch in no_accents if unicodedata.category(ch) != "Mn")

    no_accents = no_accents.lower()
    no_accents = re.sub(r"[^a-z0-9]+", " ", no_accents)
    no_accents = re.sub(r"\s+", " ", no_accents).strip()

    return no_accents


def _local_results(query: str, limit: int) -> List[Dict[str, Any]]:
    q = _normalize(query)
    results: List[Dict[str, Any]] = []

    for place in LOCAL_PLACES:
        aliases = [_normalize(a) for a in place["aliases"]]
        label_norm = _normalize(place["label"])

        matched = False

        for alias in aliases:
            if alias and (alias in q or q in alias):
                matched = True
                break

        if not matched and q and (q in label_norm or label_norm in q):
            matched = True

        if not matched:
            continue

        results.append(
            {
                "label": place["label"],
                "lat": float(place["lat"]),
                "lng": float(place["lng"]),
                "source": "local_hcmc_alias",
                "importance": 1.0,
            }
        )

    return results[:limit]


def _cache_key(query: str, limit: int) -> Path:
    raw = json.dumps({"q": query, "limit": limit}, sort_keys=True)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"geocode_{digest}.json"


def _read_cache(path: Path) -> Optional[List[Dict[str, Any]]]:
    if not path.exists():
        return None

    age = time.time() - path.stat().st_mtime

    if age > CACHE_TTL_SECONDS:
        return None

    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, list) else None
    except Exception:
        return None


def _write_cache(path: Path, data: List[Dict[str, Any]]) -> None:
    tmp = path.with_suffix(".tmp")

    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        tmp.replace(path)
    except Exception:
        pass


def _bias_hcmc(query: str) -> str:
    """Bias free-text geocoding to Vietnam, not only HCMC.

    Local HCMC demo roads are handled by LOCAL_PLACES before this function.
    For everything else, append Vietnam so users can search Hanoi, Da Nang,
    Can Tho, Hue, Nha Trang, etc.
    """

    q = query.strip()
    lower = _normalize(q)

    already_has_country_context = any(
        token in lower
        for token in [
            "vietnam",
            "viet nam",
            "vn",
        ]
    )

    if already_has_country_context:
        return q

    return f"{q}, Vietnam"

def _google_places_key() -> str:
    return (
        os.getenv("GOOGLE_PLACES_API_KEY", "").strip()
        or os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    )


async def _google_place_details(
    client: httpx.AsyncClient,
    api_key: str,
    place_id: str,
    session_token: str,
) -> Optional[Dict[str, Any]]:
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types",
    }

    params = {
        "languageCode": "vi",
        "regionCode": "vn",
        "sessionToken": session_token,
    }

    try:
        res = await client.get(
            f"{GOOGLE_PLACE_DETAILS_URL}/{place_id}",
            headers=headers,
            params=params,
        )
        res.raise_for_status()
        data = res.json()
    except Exception:
        return None

    location = data.get("location") or {}

    try:
        lat = float(location["latitude"])
        lng = float(location["longitude"])
    except Exception:
        return None

    display_name = (data.get("displayName") or {}).get("text")
    formatted_address = data.get("formattedAddress")

    if display_name and formatted_address:
        label = f"{display_name}, {formatted_address}"
    else:
        label = formatted_address or display_name or "Google place"

    return {
        "label": label,
        "lat": lat,
        "lng": lng,
        "source": "google_places",
        "importance": 2.0,
        "place_id": data.get("id") or place_id,
        "types": data.get("types", []),
    }


async def _google_places_results(query: str, limit: int) -> List[Dict[str, Any]]:
    api_key = _google_places_key()

    if not api_key:
        return []

    session_token = uuid.uuid4().hex

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "suggestions.placePrediction.placeId,"
            "suggestions.placePrediction.text.text"
        ),
    }

    body = {
        "input": query,
        "includedRegionCodes": ["vn"],
        "languageCode": "vi",
        "regionCode": "vn",
        "sessionToken": session_token,
        "locationBias": {
            "circle": {
                "center": HCMC_BIAS_CENTER,
                "radius": 65000.0,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(GOOGLE_AUTOCOMPLETE_URL, headers=headers, json=body)
            res.raise_for_status()
            raw = res.json()

            predictions = []

            for item in raw.get("suggestions", []):
                prediction = item.get("placePrediction")
                if not prediction:
                    continue

                place_id = prediction.get("placeId")
                text = ((prediction.get("text") or {}).get("text") or "").strip()

                if not place_id:
                    continue

                predictions.append(
                    {
                        "place_id": place_id,
                        "fallback_label": text,
                    }
                )

            predictions = predictions[:limit]

            details = await asyncio.gather(
                *[
                    _google_place_details(
                        client=client,
                        api_key=api_key,
                        place_id=item["place_id"],
                        session_token=session_token,
                    )
                    for item in predictions
                ],
                return_exceptions=True,
            )

    except Exception:
        return []

    results: List[Dict[str, Any]] = []

    for item, detail in zip(predictions, details):
        if isinstance(detail, dict):
            results.append(detail)
            continue

        # If details failed, keep no-coordinate predictions out because route needs lat/lng.
        # Nominatim/local fallback below can still answer the query.
        continue

    return results[:limit]

async def geocode_address(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    query = query.strip()
    limit = max(1, min(int(limit), 8))

    # 1. Local alias match first. Instant and reliable for scripted demo roads.
    local = _local_results(query, limit)

    # 2. Google Places next. This makes search feel close to Google Maps when a key exists.
    google = await _google_places_results(query, limit)

    if google:
        merged: List[Dict[str, Any]] = []
        seen = set()

        for item in [*local, *google]:
            try:
                key = (
                    f"{round(float(item['lat']), 5)}:"
                    f"{round(float(item['lng']), 5)}:"
                    f"{item.get('label', '')}"
                )
            except Exception:
                continue

            if key in seen:
                continue

            seen.add(key)
            merged.append(item)

        return merged[:limit]

    if local:
        return local

    # 3. Cached Nominatim result.
    biased_query = _bias_hcmc(query)
    cache_path = _cache_key(biased_query, limit)

    cached = _read_cache(cache_path)

    if cached is not None:
        return cached

    # 4. OpenStreetMap / Nominatim fallback.
    params = {
        "q": biased_query,
        "format": "jsonv2",
        "limit": limit,
        "countrycodes": "vn",
        "addressdetails": 1,
        "dedupe": 1,
    }

    headers = {
        "User-Agent": "FloodWatch-Hackathon-MVP/0.2",
    }

    async with httpx.AsyncClient(timeout=12, headers=headers) as client:
        res = await client.get(NOMINATIM_URL, params=params)
        res.raise_for_status()
        raw = res.json()

    results: List[Dict[str, Any]] = []

    for item in raw:
        try:
            lat = float(item["lat"])
            lng = float(item["lon"])
        except Exception:
            continue

        results.append(
            {
                "label": item.get("display_name", biased_query),
                "lat": lat,
                "lng": lng,
                "source": "nominatim",
                "importance": float(item.get("importance", 0) or 0),
            }
        )

    _write_cache(cache_path, results)
    return results