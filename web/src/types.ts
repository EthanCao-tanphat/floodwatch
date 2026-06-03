export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe'
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export type EvidenceState = 'live' | 'forecast' | 'susceptibility' | 'unavailable'
export type TravelMode = 'motorbike' | 'car' | 'walk' | 'bicycle' | 'transit'

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
  river_discharge_m3s?: number | null
  river_discharge_ratio?: number | null
  river_signal?: string | null
  river_source?: string | null
  hotspot_proximity: number
  drainage_score: number | null
  report_count: number
  photo_confirmed: boolean
  report_age_min?: number | null
  risk_bearing_report_count?: number
}

export interface CoverageSignals {
  rainfall: boolean
  tide: boolean
  hotspots: boolean
  drainage: boolean
  rider_reports: boolean
}

export interface CoverageInfo {
  tier: number
  label: string
  city: string
  signals: CoverageSignals
  confidence_note: string
}

export interface ForecastPoint {
  minutes_ahead: number
  probability: number
  risk_score: number
  rainfall_mm: number
  risk_level: RiskLevel
  passability: Passability
  confidence: ConfidenceLevel
  evidence_state: EvidenceState
  evidence: RiskEvidence
  evidence_summary?: string
  calibration_flags?: string[]
}

export interface ForecastResponse {
  lat: number
  lng: number
  district: string
  points: ForecastPoint[]
  evidence_state: EvidenceState
  explanation: string
}

export interface RouteTimelinePoint {
  minutes_ahead: number
  flood_prob_max: number
  flood_prob_avg: number

  risk_level: RiskLevel
  passability: Passability
  confidence: ConfidenceLevel
  evidence_state: EvidenceState

  high_risk_segments: number
  severe_segments: number

  rainfall_mm_max: number
  tide_level_m: number | null

  dominant_signal: string
  recommendation: string
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
  evidence_state: EvidenceState
  evidence: RiskEvidence
}

export interface AlternativeRoute {
  distance_km: number
  eta_min: number
  overall_risk: RiskLevel
  flood_prob_max: number
  points: Coord[]
  is_fastest: boolean
  route_id?: string | null
}

export interface RouteCandidate {
  id: string
  label: string
  street_summary: string
  distance_km: number
  eta_min: number
  points: Coord[]
  segments: RouteSegment[]

  overall_risk: RiskLevel
  overall_passability: Passability
  confidence: ConfidenceLevel
  evidence_state: EvidenceState

  recommendation: string
  flood_prob_max: number

  is_recommended: boolean
  is_fastest: boolean
  is_safest: boolean

  tradeoff_summary: string
  evidence_summary?: string
  calibration_flags?: string[]

  timeline: RouteTimelinePoint[]
  future_peak_risk: RiskLevel
  future_peak_min: number
  future_risk_summary: string
  route_score: number
  travel_mode: TravelMode
}

export interface RouteResponse {
  distance_km: number
  eta_min: number
  segments: RouteSegment[]

  overall_risk: RiskLevel
  overall_passability: Passability
  confidence: ConfidenceLevel
  evidence_state: EvidenceState

  recommendation: string
  evidence_summary?: string
  calibration_flags?: string[]
  rerouted?: boolean
  alternatives?: AlternativeRoute[]

  routes?: RouteCandidate[]
  selected_route_id?: string | null
  recommended_route_id?: string | null
  fastest_route_id?: string | null
  safest_route_id?: string | null

  coverage?: CoverageInfo | null

  timeline?: RouteTimelinePoint[]
  future_peak_risk?: RiskLevel
  future_peak_min?: number
  future_risk_summary?: string
  route_score?: number
  travel_mode?: TravelMode
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
  report_store?: 'postgres' | 'memory' | string
  report_ttl_hours?: number
  routing_provider?: 'graphhopper' | 'fallback' | string
  weather_cache?: 'fresh' | 'stale' | 'unknown' | string
}

export interface GeocodeResult {
  label: string
  lat: number
  lng: number
  source: string
  importance?: number
  place_id?: string | null
  types?: string[]
}

export type SearchProvider = 'google' | 'local' | 'nominatim' | 'coordinate'

export interface SearchSuggestion {
  place_id: string
  provider: SearchProvider

  title: string
  subtitle: string
  description: string

  lat?: number | null
  lng?: number | null

  needs_resolve: boolean
  source: string
}

export interface PlaceResolveResponse {
  place_id: string
  provider: SearchProvider

  title: string
  subtitle: string
  label: string

  lat: number
  lng: number

  source: string
}

export interface MapHotspot {
  id: string
  name: string
  city_id: string
  city_name: string
  lat: number
  lng: number
  historical_freq: number
  source: string
  coord_note?: string | null
  evidence_type: 'historical_hotspot'
  evidence_state: 'susceptibility'
  data_quality: 'curated_seed' | 'verified' | string
}

export interface RiderReport {
  id: string
  created_at: number
  expires_at?: number
  lat: number
  lng: number
  passability: Passability
  confidence: number
  photo_confirmed: boolean
  source: string
  evidence_type?: 'live_report'
  evidence_state?: 'live'
  report_age_min?: number
}

export interface WrongPredictionFeedbackRequest {
  route_id?: string | null
  lat?: number | null
  lng?: number | null
  evidence_state?: EvidenceState | null
  overall_risk?: RiskLevel | null
  selected_passability?: Passability | null
  user_note?: string
}

export interface WrongPredictionFeedbackResponse {
  id: string
  created_at: number
  stored: boolean
}

export interface WeatherAlert {
  id: string
  name: string
  lat: number
  lng: number
  rain_30m_mm: number
  rain_90m_mm: number
  precip_probability_pct: number
  alert_level: 'watch' | 'moderate' | 'high' | string
  evidence_type: 'rainfall_forecast'
  evidence_state: 'forecast'
  source: string
  updated_at: number
}

export interface MapEvidenceResponse {
  hotspots: MapHotspot[]
  reports: RiderReport[]
  weather_alerts?: WeatherAlert[]
}

export interface LayerSettings {
  routeSegments: boolean
  alternatives: boolean
  segmentNumbers: boolean
  hotspots: boolean
  reports: boolean
  weatherAlerts: boolean
}

export type LayerKey = keyof LayerSettings
