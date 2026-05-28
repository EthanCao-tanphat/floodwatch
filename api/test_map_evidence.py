import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app
from services.reports import REPORTS, add_report


class MapEvidenceTests(unittest.TestCase):
    def setUp(self):
        REPORTS.clear()
        self.client = TestClient(app)

    def test_map_evidence_returns_all_seed_city_hotspots(self):
        response = self.client.get("/map/evidence", params={"include_weather": "false"})

        self.assertEqual(response.status_code, 200)

        hotspots = response.json()["hotspots"]
        city_ids = {item["city_id"] for item in hotspots}

        self.assertGreaterEqual(len(hotspots), 24)
        self.assertIn("hcmc", city_ids)
        self.assertIn("hanoi", city_ids)
        self.assertIn("danang", city_ids)
        self.assertIn("cantho", city_ids)
        self.assertIn("hue", city_ids)

    def test_hotspots_include_honest_evidence_metadata(self):
        response = self.client.get("/map/evidence", params={"include_weather": "false"})
        hotspot = response.json()["hotspots"][0]

        self.assertIn("id", hotspot)
        self.assertIn("city_name", hotspot)
        self.assertEqual(hotspot["evidence_type"], "historical_hotspot")
        self.assertEqual(hotspot["evidence_state"], "susceptibility")
        self.assertIn(hotspot["data_quality"], {"curated_seed", "verified"})

    def test_reports_are_separate_live_evidence(self):
        add_report(
            {
                "lat": 10.7769,
                "lng": 106.7009,
                "passability": "slow_pass",
                "confidence": 0.8,
            }
        )

        response = self.client.get("/map/evidence", params={"include_weather": "false"})
        payload = response.json()

        self.assertGreater(len(payload["hotspots"]), 0)
        self.assertEqual(len(payload["reports"]), 1)
        self.assertEqual(payload["reports"][0]["evidence_type"], "live_report")
        self.assertEqual(payload["reports"][0]["evidence_state"], "live")

    def test_bbox_filters_hotspots_and_reports(self):
        add_report(
            {
                "lat": 21.0278,
                "lng": 105.8342,
                "passability": "slow_pass",
                "confidence": 0.8,
            }
        )

        response = self.client.get(
            "/map/evidence",
            params={"bbox": "105.70,20.90,105.95,21.10", "include_weather": "false"},
        )
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["hotspots"])
        self.assertTrue(all(item["city_id"] == "hanoi" for item in payload["hotspots"]))
        self.assertEqual(len(payload["reports"]), 1)

    def test_weather_watch_points_are_forecast_evidence(self):
        weather = [
            {
                "id": "weather-hcmc",
                "name": "Ho Chi Minh City",
                "lat": 10.7769,
                "lng": 106.7009,
                "rain_30m_mm": 2.5,
                "rain_90m_mm": 5.0,
                "precip_probability_pct": 70,
                "alert_level": "moderate",
                "evidence_type": "rainfall_forecast",
                "evidence_state": "forecast",
                "source": "Open-Meteo forecast",
                "updated_at": 123,
            }
        ]

        with patch("main._weather_watch_points", new=AsyncMock(return_value=weather)):
            response = self.client.get("/map/evidence")

        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["weather_alerts"], weather)
        self.assertEqual(payload["weather_alerts"][0]["evidence_type"], "rainfall_forecast")
        self.assertEqual(payload["weather_alerts"][0]["evidence_state"], "forecast")


if __name__ == "__main__":
    unittest.main()
