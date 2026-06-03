"""Rider report persistence and route evidence helpers.

Production can store reports in Postgres via DATABASE_URL. Local/dev falls back
to memory so the app remains easy to run.
"""

from __future__ import annotations

import math
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from config import DATABASE_URL, REPORT_TTL_HOURS

try:  # Optional dependency path: memory fallback works without psycopg.
    import psycopg
except Exception:  # pragma: no cover - exercised only when dependency missing
    psycopg = None  # type: ignore[assignment]


REPORTS: List[Dict[str, Any]] = []
FEEDBACK: List[Dict[str, Any]] = []

SEVERITY_BONUS = {
    "safe": 0.00,
    "slow_pass": 0.08,
    "avoid_for_motorbikes": 0.16,
    "impassable": 0.25,
    "unknown": 0.00,
}

_POSTGRES_READY: Optional[bool] = None


def report_ttl_seconds() -> int:
    return max(60, int(float(REPORT_TTL_HOURS) * 3600))


def report_ttl_hours() -> float:
    return round(report_ttl_seconds() / 3600, 2)


def _now() -> int:
    return int(time.time())


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


def _connect():
    if not DATABASE_URL or psycopg is None:
        return None

    return psycopg.connect(DATABASE_URL, connect_timeout=3)


def _ensure_postgres() -> bool:
    global _POSTGRES_READY

    if _POSTGRES_READY is not None:
        return _POSTGRES_READY

    if not DATABASE_URL or psycopg is None:
        _POSTGRES_READY = False
        return False

    try:
        with _connect() as conn:
            if conn is None:
                _POSTGRES_READY = False
                return False

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rider_reports (
                    id TEXT PRIMARY KEY,
                    created_at BIGINT NOT NULL,
                    expires_at BIGINT NOT NULL,
                    lat DOUBLE PRECISION NOT NULL,
                    lng DOUBLE PRECISION NOT NULL,
                    passability TEXT NOT NULL,
                    confidence DOUBLE PRECISION NOT NULL,
                    photo_confirmed BOOLEAN NOT NULL,
                    source TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS prediction_feedback (
                    id TEXT PRIMARY KEY,
                    created_at BIGINT NOT NULL,
                    route_id TEXT,
                    lat DOUBLE PRECISION,
                    lng DOUBLE PRECISION,
                    evidence_state TEXT,
                    overall_risk TEXT,
                    selected_passability TEXT,
                    user_note TEXT NOT NULL
                )
                """
            )
            conn.commit()

        _POSTGRES_READY = True
    except Exception:
        _POSTGRES_READY = False

    return bool(_POSTGRES_READY)


def report_store_mode() -> str:
    return "postgres" if _ensure_postgres() else "memory"


def _with_report_metadata(report: Dict[str, Any], now: Optional[int] = None) -> Dict[str, Any]:
    current = _now() if now is None else now
    created_at = int(report["created_at"])
    expires_at = int(report["expires_at"])

    return {
        **report,
        "created_at": created_at,
        "expires_at": expires_at,
        "lat": float(report["lat"]),
        "lng": float(report["lng"]),
        "confidence": float(report.get("confidence", 0.5)),
        "photo_confirmed": bool(report.get("photo_confirmed", False)),
        "source": str(report.get("source", "rider_photo")),
        "evidence_type": "live_report",
        "evidence_state": "live",
        "report_age_min": max(0, int((current - created_at) / 60)),
    }


def _active_memory_reports(now: Optional[int] = None) -> List[Dict[str, Any]]:
    current = _now() if now is None else now
    REPORTS[:] = [report for report in REPORTS if int(report.get("expires_at", 0)) > current]
    return [_with_report_metadata(report, current) for report in REPORTS]


def cleanup_expired_reports() -> int:
    current = _now()

    if _ensure_postgres():
        try:
            with _connect() as conn:
                if conn is None:
                    return 0
                cursor = conn.execute(
                    "DELETE FROM rider_reports WHERE expires_at <= %s",
                    (current,),
                )
                conn.commit()
                return int(cursor.rowcount or 0)
        except Exception:
            pass

    before = len(REPORTS)
    _active_memory_reports(current)
    return before - len(REPORTS)


def add_report(report: Dict[str, Any]) -> Dict[str, Any]:
    current = _now()
    payload = {
        "id": str(report.get("id") or uuid.uuid4())[:36],
        "created_at": int(report.get("created_at") or current),
        "expires_at": int(report.get("expires_at") or current + report_ttl_seconds()),
        "lat": float(report["lat"]),
        "lng": float(report["lng"]),
        "passability": report.get("passability", "unknown"),
        "confidence": float(report.get("confidence", 0.5)),
        "photo_confirmed": bool(report.get("photo_confirmed", True)),
        "source": report.get("source", "rider_photo"),
    }

    if _ensure_postgres():
        try:
            with _connect() as conn:
                if conn is None:
                    raise RuntimeError("postgres unavailable")
                conn.execute(
                    """
                    INSERT INTO rider_reports
                    (id, created_at, expires_at, lat, lng, passability, confidence, photo_confirmed, source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        created_at = EXCLUDED.created_at,
                        expires_at = EXCLUDED.expires_at,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        passability = EXCLUDED.passability,
                        confidence = EXCLUDED.confidence,
                        photo_confirmed = EXCLUDED.photo_confirmed,
                        source = EXCLUDED.source
                    """,
                    (
                        payload["id"],
                        payload["created_at"],
                        payload["expires_at"],
                        payload["lat"],
                        payload["lng"],
                        payload["passability"],
                        payload["confidence"],
                        payload["photo_confirmed"],
                        payload["source"],
                    ),
                )
                conn.commit()
            return _with_report_metadata(payload, current)
        except Exception:
            # Fall back to memory for this process if production storage hiccups.
            pass

    REPORTS.append(payload)
    REPORTS[:] = REPORTS[-250:]
    return _with_report_metadata(payload, current)


def list_reports() -> List[Dict[str, Any]]:
    current = _now()
    cleanup_expired_reports()

    if _ensure_postgres():
        try:
            with _connect() as conn:
                if conn is None:
                    raise RuntimeError("postgres unavailable")
                rows = conn.execute(
                    """
                    SELECT id, created_at, expires_at, lat, lng, passability, confidence, photo_confirmed, source
                    FROM rider_reports
                    WHERE expires_at > %s
                    ORDER BY created_at DESC
                    LIMIT 500
                    """,
                    (current,),
                ).fetchall()

            return [
                _with_report_metadata(
                    {
                        "id": row[0],
                        "created_at": row[1],
                        "expires_at": row[2],
                        "lat": row[3],
                        "lng": row[4],
                        "passability": row[5],
                        "confidence": row[6],
                        "photo_confirmed": row[7],
                        "source": row[8],
                    },
                    current,
                )
                for row in rows
            ]
        except Exception:
            pass

    return _active_memory_reports(current)


def count_reports() -> int:
    return len(list_reports())


def add_prediction_feedback(feedback: Dict[str, Any]) -> Dict[str, Any]:
    current = _now()
    payload = {
        "id": str(uuid.uuid4())[:8],
        "created_at": current,
        "route_id": feedback.get("route_id"),
        "lat": feedback.get("lat"),
        "lng": feedback.get("lng"),
        "evidence_state": feedback.get("evidence_state"),
        "overall_risk": feedback.get("overall_risk"),
        "selected_passability": feedback.get("selected_passability"),
        "user_note": str(feedback.get("user_note") or "")[:500],
    }

    if _ensure_postgres():
        try:
            with _connect() as conn:
                if conn is None:
                    raise RuntimeError("postgres unavailable")
                conn.execute(
                    """
                    INSERT INTO prediction_feedback
                    (id, created_at, route_id, lat, lng, evidence_state, overall_risk, selected_passability, user_note)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        payload["id"],
                        payload["created_at"],
                        payload["route_id"],
                        payload["lat"],
                        payload["lng"],
                        payload["evidence_state"],
                        payload["overall_risk"],
                        payload["selected_passability"],
                        payload["user_note"],
                    ),
                )
                conn.commit()
            return payload
        except Exception:
            pass

    FEEDBACK.append(payload)
    FEEDBACK[:] = FEEDBACK[-500:]
    return payload


def _calibration_flags(nearby: List[Dict[str, Any]], modeled_prob: Optional[float]) -> List[str]:
    flags: List[str] = []

    if modeled_prob is None or not nearby:
        return flags

    has_impassable = any(r.get("passability") == "impassable" for r in nearby)
    has_risk = any(SEVERITY_BONUS.get(r.get("passability", "unknown"), 0.0) > 0 for r in nearby)
    has_safe = any(r.get("passability") == "safe" for r in nearby)

    if has_impassable and modeled_prob < 0.55:
        flags.append("report_higher_than_model")

    if has_risk and modeled_prob < 0.25:
        flags.append("report_risk_not_predicted")

    if has_safe and modeled_prob >= 0.55:
        flags.append("model_higher_than_report")

    return flags


def report_evidence_for_segment(
    start: Tuple[float, float],
    end: Tuple[float, float],
    radius_km: float = 0.65,
    modeled_prob: Optional[float] = None,
    reports: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return recent report evidence near a segment midpoint.

    start/end are (lat, lng). Only active, non-expired, confirmed reports can
    affect route risk. Unknown/safe reports are still visible as evidence but do
    not increase risk.
    """

    mid_lat = (start[0] + end[0]) / 2
    mid_lng = (start[1] + end[1]) / 2

    nearby: List[Dict[str, Any]] = []

    active_reports = list_reports() if reports is None else reports

    for report in active_reports:
        d = _haversine_km(mid_lat, mid_lng, report["lat"], report["lng"])

        if d <= radius_km:
            nearby.append(report)

    if not nearby:
        return {
            "report_count": 0,
            "photo_confirmed": False,
            "risk_bonus": 0.0,
            "report_age_min": None,
            "risk_bearing_report_count": 0,
            "calibration_flags": [],
        }

    confirmed = [r for r in nearby if bool(r.get("photo_confirmed", False))]
    risk_bearing = [
        r
        for r in confirmed
        if SEVERITY_BONUS.get(r.get("passability", "unknown"), 0.0) > 0
    ]
    ages = [
        int(r.get("report_age_min", 0))
        for r in nearby
        if r.get("report_age_min") is not None
    ]

    if not risk_bearing:
        return {
            "report_count": len(nearby),
            "photo_confirmed": bool(confirmed),
            "risk_bonus": 0.0,
            "report_age_min": min(ages) if ages else None,
            "risk_bearing_report_count": 0,
            "calibration_flags": _calibration_flags(nearby, modeled_prob),
        }

    max_bonus = max(SEVERITY_BONUS.get(r.get("passability", "unknown"), 0.0) for r in risk_bearing)
    count_bonus = min(0.12, len(risk_bearing) * 0.03)

    return {
        "report_count": len(nearby),
        "photo_confirmed": True,
        "risk_bonus": min(0.35, max_bonus + count_bonus),
        "report_age_min": min(ages) if ages else None,
        "risk_bearing_report_count": len(risk_bearing),
        "calibration_flags": _calibration_flags(nearby, modeled_prob),
    }
