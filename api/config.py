"""Central config. Loads .env at import time."""
import os
from dotenv import load_dotenv

load_dotenv()

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
DASHSCOPE_BASE_URL = os.getenv(
    "DASHSCOPE_BASE_URL",
    "https://dashscope-intl.aliyuncs.com/api/v1",
)

# Vietnam bounding box (rough). Used to reject obviously-off-the-map coordinates.
# North: 23.4° (Lung Cu), South: 8.5° (Ca Mau), West: 102.1°, East: 109.5°
VN_LAT_MIN, VN_LAT_MAX = 8.0, 24.0
VN_LNG_MIN, VN_LNG_MAX = 102.0, 110.0

# Open-Meteo forecast endpoint (no key needed)
OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"

# Open-Meteo Flood API endpoint backed by GloFAS river-discharge forecasts.
OPENMETEO_FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"

# Secondary global forecast source used when Open-Meteo throttles shared hosts.
METNO_LOCATIONFORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"

# Tiered coverage. See docs/architecture.md for the rationale.
#
# Tier 1 — full multi-feature fusion (rainfall + tide + drainage + historical hotspots)
# Tier 2 — rainfall + tide only, coarser confidence
# Tier 3 — rainfall-only heavy-rain warnings, no flood-specific prediction
PILOT_CITIES = {
    "hcmc": {
        "name_vi": "TP. Hồ Chí Minh",
        "name_en": "Ho Chi Minh City",
        "center": (10.78, 106.70),
        "radius_km": 35,
        "tier": 1,
        "coastal": True,
        "tide_station": "vung_tau",
    },
    "hanoi": {
        "name_vi": "Hà Nội",
        "name_en": "Hanoi",
        "center": (21.03, 105.85),
        "radius_km": 30,
        "tier": 2,
        "coastal": False,
        "tide_station": None,
    },
    "danang": {
        "name_vi": "Đà Nẵng",
        "name_en": "Da Nang",
        "center": (16.07, 108.22),
        "radius_km": 20,
        "tier": 2,
        "coastal": True,
        "tide_station": "danang",
    },
    "cantho": {
        "name_vi": "Cần Thơ",
        "name_en": "Can Tho",
        "center": (10.03, 105.78),
        "radius_km": 20,
        "tier": 2,
        "coastal": False,
        "tide_station": "vung_tau",
    },
    "hue": {
        "name_vi": "Huế",
        "name_en": "Hue",
        "center": (16.46, 107.59),
        "radius_km": 15,
        "tier": 2,
        "coastal": True,
        "tide_station": "danang",
    },
}
