import type {
  Coord,
  DepthReportResponse,
  ForecastResponse,
  GeocodeResult,
  MapEvidenceResponse,
  RouteResponse,
  StatusResponse,
  PlaceResolveResponse,
  SearchSuggestion,
  TravelMode,
  WrongPredictionFeedbackRequest,
  WrongPredictionFeedbackResponse,
} from '../types'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }

  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }

  return res.json() as Promise<T>
}

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })

  return search.toString()
}

export const api = {
  health: async () => get<{ status: string; service: string; version: string }>('/'),

  status: async () => get<StatusResponse>('/status'),

  mapEvidence: async () => get<MapEvidenceResponse>('/map/evidence'),

  geocode: async (q: string, limit = 5) =>
    get<GeocodeResult[]>(
      `/geocode?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`
    ),

  forecast: (lat: number, lng: number, horizon_min = 60) =>
    post<ForecastResponse>('/forecast/segment', { lat, lng, horizon_min }),

  route: (from: Coord, to: Coord, depart_at_min = 0, travel_mode: TravelMode = 'motorbike') =>
    post<RouteResponse>('/route/safe', { from, to, depart_at_min, travel_mode }),

  reportDepth: (image_base64: string, lat: number, lng: number) =>
    post<DepthReportResponse>('/report/depth', { image_base64, lat, lng }),

  reportWrongPrediction: (feedback: WrongPredictionFeedbackRequest) =>
    post<WrongPredictionFeedbackResponse>('/feedback/wrong-prediction', feedback),

  searchSuggest: async (
  q: string,
  limit = 7,
  sessionToken?: string,
  bias?: Coord | null,
  allowNominatim = false
) => {
  const query = toQuery({
    q,
    limit,
    session_token: sessionToken,
    lat: bias?.lat,
    lng: bias?.lng,
    allow_nominatim: allowNominatim ? 'true' : 'false',
  })

  return get<SearchSuggestion[]>(`/api/search/suggest?${query}`)
},

searchResolve: async (
  suggestion: SearchSuggestion,
  sessionToken?: string
) =>
  post<PlaceResolveResponse>('/api/search/resolve', {
    place_id: suggestion.place_id,
    provider: suggestion.provider,
    title: suggestion.title,
    subtitle: suggestion.subtitle,
    lat: suggestion.lat ?? null,
    lng: suggestion.lng ?? null,
    session_token: sessionToken ?? null,
  }),
}

// Helper: read a File into base64, without data: prefix.
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }

    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
