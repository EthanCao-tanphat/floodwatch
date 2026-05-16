// These types mirror api/models.py exactly. Keep in sync.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe'

export interface Coord {
  lat: number
  lng: number
}

export interface ForecastPoint {
  minutes_ahead: number
  probability: number
  rainfall_mm: number
  risk_level: RiskLevel
}

export interface ForecastResponse {
  lat: number
  lng: number
  district: string
  points: ForecastPoint[]
  explanation: string
}

export interface RouteSegment {
  start: Coord
  end: Coord
  points?: Coord[]
  flood_prob: number
  risk_level: RiskLevel
}

export interface AlternativeRoute {
  distance_km: number
  eta_min: number
  overall_risk: RiskLevel
  flood_prob_max: number
  points: Coord[]
  is_fastest: boolean
}

export interface RouteResponse {
  distance_km: number
  eta_min: number
  segments: RouteSegment[]
  overall_risk: RiskLevel
  recommendation: string
  rerouted?: boolean
  alternatives?: AlternativeRoute[]
}

export type DepthClass = 'dry' | 'ankle' | 'knee' | 'impassable'

export interface DepthReportResponse {
  depth_class: DepthClass
  confidence: number
  reasoning: string
  lat: number
  lng: number
}