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
    explanation: str  # human-readable: "tide rising + 18mm rain forecast in 30min"


# ---------- /route/safe ----------
class RouteRequest(BaseModel):
    from_: Coord = Field(..., alias="from")
    to: Coord
    depart_at_min: int = 0  # depart this many minutes from now

    class Config:
        populate_by_name = True


class RouteSegment(BaseModel):
    start: Coord
    end: Coord
    points: List[Coord] = []  # full polyline points for this segment (real road geometry)
    flood_prob: float
    risk_level: str


class RouteResponse(BaseModel):
    distance_km: float
    eta_min: int
    segments: List[RouteSegment]
    overall_risk: str
    recommendation: str  # natural language tip from the alert agent


# ---------- /report/depth ----------
class DepthReportRequest(BaseModel):
    image_base64: str  # raw base64, no data: prefix
    lat: float
    lng: float


class DepthReportResponse(BaseModel):
    depth_class: str  # "dry" | "ankle" | "knee" | "impassable"
    confidence: float
    reasoning: str
    lat: float
    lng: float