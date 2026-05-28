"""Pydantic schemas for FloodWatch API."""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


RiskLevel = Literal["low", "moderate", "high", "severe"]
ConfidenceLevel = Literal["low", "medium", "high"]
EvidenceState = Literal["live", "forecast", "susceptibility", "unavailable"]
TravelMode = Literal["motorbike", "car", "walk", "bicycle", "transit"]

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
    river_discharge_m3s: Optional[float] = None
    river_discharge_ratio: Optional[float] = None
    river_signal: Optional[str] = None
    river_source: Optional[str] = None
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
    evidence_state: EvidenceState = "forecast"
    evidence: RiskEvidence


class ForecastResponse(BaseModel):
    lat: float
    lng: float
    district: str
    points: List[ForecastPoint]
    evidence_state: EvidenceState = "forecast"
    explanation: str


# ---------- /route/safe ----------


class RouteRequest(BaseModel):
    from_: Coord = Field(..., alias="from")
    to: Coord
    depart_at_min: int = 0
    travel_mode: TravelMode = "motorbike"

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
    evidence_state: EvidenceState = "forecast"
    evidence: RiskEvidence


class AlternativeRoute(BaseModel):
    distance_km: float
    eta_min: int
    overall_risk: RiskLevel
    flood_prob_max: float
    points: List[Coord]
    is_fastest: bool = False
    route_id: Optional[str] = None

class RouteTimelinePoint(BaseModel):
    minutes_ahead: int
    flood_prob_max: float
    flood_prob_avg: float

    risk_level: RiskLevel
    passability: Passability
    confidence: ConfidenceLevel
    evidence_state: EvidenceState = "forecast"

    high_risk_segments: int = 0
    severe_segments: int = 0

    rainfall_mm_max: float = 0.0
    tide_level_m: Optional[float] = None

    dominant_signal: str = ""
    recommendation: str = ""


class RouteCandidate(BaseModel):
    id: str
    label: str
    street_summary: str = ""
    distance_km: float
    eta_min: int
    points: List[Coord]
    segments: List[RouteSegment]

    overall_risk: RiskLevel
    overall_passability: Passability
    confidence: ConfidenceLevel
    evidence_state: EvidenceState = "forecast"

    recommendation: str
    flood_prob_max: float

    is_recommended: bool = False
    is_fastest: bool = False
    is_safest: bool = False

    tradeoff_summary: str = ""
    
    timeline: List[RouteTimelinePoint] = Field(default_factory=list)
    future_peak_risk: RiskLevel = "low"
    future_peak_min: int = 0
    future_risk_summary: str = ""
    route_score: float = 0.0
    travel_mode: TravelMode = "motorbike"


class RouteResponse(BaseModel):
    # Backward-compatible selected route fields.
    distance_km: float
    eta_min: int
    segments: List[RouteSegment]

    overall_risk: RiskLevel
    overall_passability: Passability
    confidence: ConfidenceLevel
    evidence_state: EvidenceState = "forecast"

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
    
    timeline: List[RouteTimelinePoint] = Field(default_factory=list)
    future_peak_risk: RiskLevel = "low"
    future_peak_min: int = 0
    future_risk_summary: str = ""
    route_score: float = 0.0
    travel_mode: TravelMode = "motorbike"


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
    

SearchProvider = Literal["google", "local", "nominatim", "coordinate"]

class SearchSuggestion(BaseModel):
    place_id: str
    provider: SearchProvider

    title: str
    subtitle: str = ""
    description: str = ""

    lat: Optional[float] = None
    lng: Optional[float] = None

    needs_resolve: bool = True
    source: str = ""


class PlaceResolveRequest(BaseModel):
    place_id: str
    provider: SearchProvider

    title: str = ""
    subtitle: str = ""

    lat: Optional[float] = None
    lng: Optional[float] = None

    session_token: Optional[str] = None


class PlaceResolveResponse(BaseModel):
    place_id: str
    provider: SearchProvider

    title: str
    subtitle: str = ""
    label: str

    lat: float
    lng: float

    source: str = ""
