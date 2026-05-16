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

import hashlib
import json
import re
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

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
    q = query.strip()
    lower = _normalize(q)

    already_has_city_context = any(
        token in lower
        for token in [
            "vietnam",
            "viet nam",
            "ho chi minh",
            "hcmc",
            "sai gon",
            "saigon",
            "tp ho chi minh",
            "thanh pho ho chi minh",
        ]
    )

    if already_has_city_context:
        return q

    # Always append HCMC/Vietnam for local street names.
    # Do NOT stop just because the query says "District 7" or "Thu Duc".
    return f"{q}, Ho Chi Minh City, Vietnam"


async def geocode_address(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    query = query.strip()
    limit = max(1, min(int(limit), 8))

    # 1. Local alias match first. This is instant and reliable for demo roads.
    local = _local_results(query, limit)

    if local:
        return local

    # 2. Cached Nominatim result.
    biased_query = _bias_hcmc(query)
    cache_path = _cache_key(biased_query, limit)

    cached = _read_cache(cache_path)

    if cached is not None:
        return cached

    # 3. OpenStreetMap / Nominatim fallback.
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
