// These types mirror api/models.py and API responses.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export type Passability =
  | 'safe'
  | 'slow_pass'
  | 'avoid_for_motorbikes'
  | 'impassable'
  | 'unknown'

export interface Coord {
  lat: number
  lng: number
}

export interface RiskEvidence {
  rainfall_mm: number
  tide_level_m: number | null
  hotspot_proximity: number
  drainage_score: number | null
  report_count: number
  photo_confirmed: boolean
}

export interface ForecastPoint {
  minutes_ahead: number
  probability: number
  risk_score: number
  rainfall_mm: number
  risk_level: RiskLevel
  passability: Passability
  confidence: ConfidenceLevel
  evidence: RiskEvidence
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
  risk_score: number
  risk_level: RiskLevel
  passability: Passability
  confidence: ConfidenceLevel
  evidence: RiskEvidence
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
  overall_passability: Passability
  confidence: ConfidenceLevel
  recommendation: string
  rerouted?: boolean
  alternatives?: AlternativeRoute[]
}

export type DepthClass = 'dry' | 'ankle' | 'knee' | 'impassable'

export interface DepthReportResponse {
  depth_class: DepthClass
  passability: Passability
  confidence: number
  reasoning: string
  lat: number
  lng: number
}

export interface StatusResponse {
  active_reports: number
  flood_hotspots: number
  rain_now_mm: number
  tide_level_m: number
  coverage_pct: number
  pilot_city: string
}


export interface GeocodeResult {
  label: string
  lat: number
  lng: number
  source: string
  importance?: number
}


export interface MapHotspot {
  name: string
  lat: number
  lng: number
  historical_freq: number
  source: string
  coord_note?: string | null
}

export interface RiderReport {
  id: string
  created_at: number
  lat: number
  lng: number
  passability: Passability
  confidence: number
  photo_confirmed: boolean
  source: string
}

export interface MapEvidenceResponse {
  hotspots: MapHotspot[]
  reports: RiderReport[]
}

export interface LayerSettings {
  routeSegments: boolean
  alternatives: boolean
  segmentNumbers: boolean
  hotspots: boolean
  reports: boolean
}

export type LayerKey = keyof LayerSettings
