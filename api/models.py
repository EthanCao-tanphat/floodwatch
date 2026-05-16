"""Pydantic schemas. Mirror the API contract."""
from typing import List, Optional
from pydantic import BaseModel, Field


class Coord(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


# ---------- /forecast/segment ----------
class ForecastRequest(BaseModel):
    lat: float
    lng: float
    horizon_min: int = 90  # forecast horizon in minutes (max 90)


class ForecastPoint(BaseModel):
    minutes_ahead: int
    probability: float  # 0..1
    rainfall_mm: float
    risk_level: str  # "low" | "moderate" | "high" | "severe"


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
    risk_level: str


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
    depth_class: str  # "dry" | "ankle" | "knee" | "impassable"
    confidence: float
    reasoning: str
    lat: float
    lng: float