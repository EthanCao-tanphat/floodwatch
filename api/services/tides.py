"""Tide level lookup. MVP uses a hardcoded daily tide curve for Vung Tau
(closest reference station to HCMC). Replace with a scraper for the
hackathon final round.

HCMC inundation is strongly tide-driven — when tide is above ~1.3m AND
rainfall is heavy, drainage backs up. That interaction is the "magic"
in the fusion model.
"""
from datetime import datetime, timezone, timedelta
import math

VN_TZ = timezone(timedelta(hours=7))


def get_tide_level(when: datetime | None = None) -> float:
    """Return tide level in meters at the given time (default: now).

    Synthetic sinusoid mimicking semi-diurnal tide between 0.4m and 1.6m.
    Real version: scrape https://tide-forecast.com or load Vung Tau CSV.
    """
    if when is None:
        when = datetime.now(VN_TZ)
    # Hours into the day, as a float
    h = when.hour + when.minute / 60.0
    # Two peaks per day (semi-diurnal): roughly 6am low, noon high, 6pm low, midnight high
    phase = (h / 24.0) * 4 * math.pi  # 2 cycles per day
    tide = 1.0 + 0.6 * math.sin(phase - math.pi / 2)
    return round(tide, 2)


def tide_factor(level_m: float) -> float:
    """Normalized 0..1 contribution to flood risk.

    Below 1.2m: negligible. Above 1.5m: dominant. Smooth ramp in between.
    """
    if level_m <= 1.2:
        return 0.0
    if level_m >= 1.6:
        return 1.0
    return (level_m - 1.2) / 0.4
