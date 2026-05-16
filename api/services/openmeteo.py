"""Open-Meteo rainfall client. No API key needed.

Returns 15-minutely rainfall forecast for any HCMC coordinate.
Interpolated from hourly for Vietnam (no native radar model here),
but still usable for the 30/60-min MVP flood signal.
"""
from typing import List, Dict, Any
import httpx
from config import OPENMETEO_URL


async def fetch_rainfall(lat: float, lng: float, hours_ahead: int = 6) -> Dict[str, Any]:
    """Fetch 15-min rainfall and hourly probability for the next `hours_ahead` hours.

    Returns:
        {
          "minutely_15": {"time": [...], "precipitation": [mm, ...]},
          "hourly": {"time": [...], "precipitation_probability": [%, ...]},
        }
    """
    params = {
        "latitude": lat,
        "longitude": lng,
        "minutely_15": "precipitation",
        "hourly": "precipitation,precipitation_probability",
        "forecast_days": 2,
        "timezone": "Asia/Ho_Chi_Minh",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(OPENMETEO_URL, params=params)
        r.raise_for_status()
        return r.json()


def rainfall_in_window(open_meteo_data: Dict[str, Any], minutes_from_now: int) -> float:
    """Sum the rainfall (mm) in a 30-min window centered on `minutes_from_now`.

    Cheap and works for the demo. Real model would integrate the radar tile here.
    """
    bucket = open_meteo_data.get("minutely_15", {})
    rains: List[float] = bucket.get("precipitation", []) or []
    if not rains:
        return 0.0

    # 15-min buckets. Bucket index = minutes_from_now // 15.
    idx = max(0, minutes_from_now // 15)
    # Sum two adjacent buckets to get a ~30 min window.
    window = rains[idx : idx + 2]
    return float(sum(v for v in window if v is not None))
