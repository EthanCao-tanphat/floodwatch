import os
import time
import unittest

from services import reports
from services.reports import (
    FEEDBACK,
    REPORTS,
    add_prediction_feedback,
    add_report,
    list_reports,
    report_evidence_for_segment,
)


class PilotReportTests(unittest.TestCase):
    def setUp(self):
        REPORTS.clear()
        FEEDBACK.clear()
        reports._POSTGRES_READY = False

    def tearDown(self):
        REPORTS.clear()
        FEEDBACK.clear()
        reports._POSTGRES_READY = False

    def test_memory_report_gets_expiry_metadata(self):
        report = add_report(
            {
                "lat": 10.7769,
                "lng": 106.7009,
                "passability": "slow_pass",
                "confidence": 0.8,
            }
        )

        self.assertIn("expires_at", report)
        self.assertGreater(report["expires_at"], report["created_at"])
        self.assertEqual(report["evidence_type"], "live_report")
        self.assertEqual(report["evidence_state"], "live")

    def test_expired_report_is_hidden_and_does_not_affect_route(self):
        now = int(time.time())

        add_report(
            {
                "lat": 10.7769,
                "lng": 106.7009,
                "passability": "impassable",
                "confidence": 0.9,
                "created_at": now - 7200,
                "expires_at": now - 60,
            }
        )

        self.assertEqual(list_reports(), [])

        evidence = report_evidence_for_segment(
            (10.7768, 106.7008),
            (10.7770, 106.7010),
            modeled_prob=0.05,
        )

        self.assertEqual(evidence["report_count"], 0)
        self.assertEqual(evidence["risk_bonus"], 0.0)

    def test_unknown_report_does_not_raise_risk(self):
        add_report(
            {
                "lat": 10.7769,
                "lng": 106.7009,
                "passability": "unknown",
                "confidence": 0.4,
            }
        )

        evidence = report_evidence_for_segment(
            (10.7768, 106.7008),
            (10.7770, 106.7010),
            modeled_prob=0.05,
        )

        self.assertEqual(evidence["report_count"], 1)
        self.assertEqual(evidence["risk_bearing_report_count"], 0)
        self.assertEqual(evidence["risk_bonus"], 0.0)

    def test_confirmed_risk_bearing_report_increases_risk(self):
        add_report(
            {
                "lat": 10.7769,
                "lng": 106.7009,
                "passability": "avoid_for_motorbikes",
                "confidence": 0.85,
            }
        )

        evidence = report_evidence_for_segment(
            (10.7768, 106.7008),
            (10.7770, 106.7010),
            modeled_prob=0.05,
        )

        self.assertEqual(evidence["report_count"], 1)
        self.assertEqual(evidence["risk_bearing_report_count"], 1)
        self.assertGreater(evidence["risk_bonus"], 0.0)
        self.assertIn("report_risk_not_predicted", evidence["calibration_flags"])

    def test_wrong_prediction_feedback_is_separate_from_reports(self):
        feedback = add_prediction_feedback(
            {
                "route_id": "route_0",
                "lat": 10.7769,
                "lng": 106.7009,
                "evidence_state": "forecast",
                "overall_risk": "low",
                "selected_passability": "safe",
                "user_note": "Road was deeper than expected",
            }
        )

        self.assertIn("id", feedback)
        self.assertEqual(len(FEEDBACK), 1)
        self.assertEqual(count_reports_safe(), 0)


class OptionalPostgresReportTests(unittest.TestCase):
    def test_postgres_report_persistence_when_test_database_is_configured(self):
        test_url = os.getenv("TEST_DATABASE_URL")

        if not test_url:
            self.skipTest("TEST_DATABASE_URL is not configured")

        old_url = reports.DATABASE_URL
        old_ready = reports._POSTGRES_READY

        reports.DATABASE_URL = test_url
        reports._POSTGRES_READY = None

        try:
            report = add_report(
                {
                    "id": "test-report-persist",
                    "lat": 10.7769,
                    "lng": 106.7009,
                    "passability": "slow_pass",
                    "confidence": 0.8,
                }
            )
            loaded = [item for item in list_reports() if item["id"] == report["id"]]
            self.assertEqual(len(loaded), 1)
            self.assertEqual(loaded[0]["passability"], "slow_pass")
        finally:
            reports.DATABASE_URL = old_url
            reports._POSTGRES_READY = old_ready


def count_reports_safe() -> int:
    return len(list_reports())


if __name__ == "__main__":
    unittest.main()
