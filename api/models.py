"""Pydantic schemas for FloodWatch API."""

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


class CoverageSignals(BaseModel):
    rainfall: bool = True
    tide: bool = False
    hotspots: bool = False
    drainage: bool = False
    rider_reports: bool = True


class CoverageInfo(BaseModel):
    tier: int
    label: str
    city: str
    signals: CoverageSignals
    confidence_note: str


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
    distance_km: float
    eta_min: int
    overall_risk: RiskLevel
    flood_prob_max: float
    points: List[Coord]
    is_fastest: bool = False
    route_id: Optional[str] = None


class RouteCandidate(BaseModel):
    id: str
    label: str
    distance_km: float
    eta_min: int
    points: List[Coord]
    segments: List[RouteSegment]

    overall_risk: RiskLevel
    overall_passability: Passability
    confidence: ConfidenceLevel

    recommendation: str
    flood_prob_max: float

    is_recommended: bool = False
    is_fastest: bool = False
    is_safest: bool = False

    tradeoff_summary: str = ""


class RouteResponse(BaseModel):
    # Backward-compatible selected route fields.
    distance_km: float
    eta_min: int
    segments: List[RouteSegment]

    overall_risk: RiskLevel
    overall_passability: Passability
    confidence: ConfidenceLevel

    recommendation: str
    rerouted: bool = False
    alternatives: List[AlternativeRoute] = []

    # New Google-Maps-style route candidates.
    routes: List[RouteCandidate] = []
    selected_route_id: Optional[str] = None
    recommended_route_id: Optional[str] = None
    fastest_route_id: Optional[str] = None
    safest_route_id: Optional[str] = None

    # Vietnam-wide confidence tier.
    coverage: Optional[CoverageInfo] = None


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
