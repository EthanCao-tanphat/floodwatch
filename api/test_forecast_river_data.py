import unittest
from unittest.mock import AsyncMock, patch

from agents.forecast import forecast_segment
from services.openmeteo import river_discharge_signal


RAIN_NONE = {
    "minutely_15": {"precipitation": [0, 0, 0, 0, 0, 0]},
    "hourly": {"precipitation_probability": [0, 0]},
}

RIVER_HIGH = {
    "daily": {
        "river_discharge": [180.0, 220.0, 240.0],
        "river_discharge_mean": [100.0, 100.0, 100.0],
        "river_discharge_p75": [120.0, 120.0, 120.0],
        "river_discharge_max": [300.0, 300.0, 300.0],
    }
}


class ForecastRiverDataTests(unittest.IsolatedAsyncioTestCase):
    def test_river_discharge_signal_classifies_high_ratio(self):
        signal = river_discharge_signal(RIVER_HIGH)

        self.assertEqual(signal["river_discharge_m3s"], 240.0)
        self.assertEqual(signal["river_discharge_ratio"], 2.0)
        self.assertEqual(signal["river_signal"], "high")

    async def test_tier3_uses_real_river_forecast_without_live_flood_claim(self):
        with (
            patch("agents.forecast.fetch_rainfall", new=AsyncMock(return_value=RAIN_NONE)),
            patch("agents.forecast.fetch_river_discharge", new=AsyncMock(return_value=RIVER_HIGH)),
            patch("agents.forecast.get_tide_level", return_value=0.5),
        ):
            result = await forecast_segment(14.0583, 108.2772, horizon_min=60)

        self.assertEqual(result.district, "vietnam")
        self.assertEqual(result.evidence_state, "forecast")
        self.assertIn("GloFAS river signal high", result.explanation)

        point = result.points[0]
        self.assertEqual(point.evidence.river_source, "Open-Meteo GloFAS river discharge")
        self.assertEqual(point.evidence.river_signal, "high")
        self.assertEqual(point.evidence.river_discharge_ratio, 2.0)
        self.assertGreater(point.probability, 0.10)
        self.assertNotIn("detected flood", result.explanation.lower())


if __name__ == "__main__":
    unittest.main()
