"""Pydantic schemas. Mirror the API contract."""
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
    horizon_min: int = 60  # MVP focuses on 30-60 min. 90 remains a stretch horizon.


class ForecastPoint(BaseModel):
    minutes_ahead: int
    probability: float  # 0..1, kept for compatibility with current UI
    risk_score: float  # 0..1, preferred name for passability scoring
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
    points: List[Coord] = []  # full polyline points for this segment
    flood_prob: float
    risk_score: float
    risk_level: RiskLevel
    passability: Passability
    confidence: ConfidenceLevel
    evidence: RiskEvidence


class AlternativeRoute(BaseModel):
    """A rejected (or ranked-lower) alternative route, shown dimmed for context."""
    distance_km: float
    eta_min: int
    overall_risk: str
    flood_prob_max: float
    points: List[Coord]      # full polyline of this alternative
    is_fastest: bool = False  # True if this WAS the fastest path GraphHopper returned


class RouteResponse(BaseModel):
    distance_km: float                # of CHOSEN route
    eta_min: int                      # of CHOSEN route
    segments: List[RouteSegment]      # of CHOSEN route
    overall_risk: str
    recommendation: str
    rerouted: bool = False            # True if we picked a non-fastest alternative for safety
    alternatives: List[AlternativeRoute] = []  # other paths considered


# ---------- /report/depth ----------
class DepthReportRequest(BaseModel):
    image_base64: str
    lat: float
    lng: float


class DepthReportResponse(BaseModel):
    depth_class: DepthClass  # retained for compatibility; passability is preferred
    passability: Passability
    confidence: float
    reasoning: str
    lat: float
    lng: float
