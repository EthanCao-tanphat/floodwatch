"""Pydantic schemas for FloodWatch API.

These models mirror the frontend TypeScript contract.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


RiskLevel = Literal["low", "moderate", "high", "severe"]
ConfidenceLevel = Literal["low", "medium", "high"]

Passability = Literal[
    "safe",
    "slow_pass",
    "avoid_for_motorbikes",
    "impassable",
    "unknown",
]

DepthClass = Literal["dry", "ankle", "knee", "impassable"]


class Coord(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RiskEvidence(BaseModel):
    rainfall_mm: float = 0.0
    tide_level_m: Optional[float] = None
    hotspot_proximity: float = 0.0
    drainage_score: Optional[float] = None
    report_count: int = 0
    photo_confirmed: bool = False


# ---------- /forecast/segment ----------


class ForecastRequest(BaseModel):
    lat: float
    lng: float
    horizon_min: int = 60


class ForecastPoint(BaseModel):
    minutes_ahead: int
    probability: float
    risk_score: float
    rainfall_mm: float
    risk_level: RiskLevel
    passability: Passability
    confidence: ConfidenceLevel
    evidence: RiskEvidence


class ForecastResponse(BaseModel):
    lat: float
    lng: float
    district: str
    points: List[ForecastPoint]
    explanation: str


# ---------- /route/safe ----------


class RouteRequest(BaseModel):
    from_: Coord = Field(..., alias="from")
    to: Coord
    depart_at_min: int = 0

    class Config:
        populate_by_name = True


class RouteSegment(BaseModel):
    start: Coord
    end: Coord
    points: List[Coord] = []
    flood_prob: float
    risk_score: float
    risk_level: RiskLevel
    passability: Passability
    confidence: ConfidenceLevel
    evidence: RiskEvidence


class AlternativeRoute(BaseModel):
    """A rejected/ranked-lower alternative route, shown dimmed on the map."""

    distance_km: float
    eta_min: int
    overall_risk: RiskLevel
    flood_prob_max: float
    points: List[Coord]
    is_fastest: bool = False


class RouteResponse(BaseModel):
    distance_km: float
    eta_min: int
    segments: List[RouteSegment]

    overall_risk: RiskLevel
    overall_passability: Passability
    confidence: ConfidenceLevel

    recommendation: str
    rerouted: bool = False
    alternatives: List[AlternativeRoute] = []


# ---------- /report/depth ----------


class DepthReportRequest(BaseModel):
    image_base64: str
    lat: float
    lng: float


class DepthReportResponse(BaseModel):
    depth_class: DepthClass
    passability: Passability
    confidence: float
    reasoning: str
    lat: float
    lng: float
