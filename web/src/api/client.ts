import type {
  Coord,
  DepthReportResponse,
  ForecastResponse,
  GeocodeResult,
  RouteResponse,
  StatusResponse,
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

export const api = {
  health: async () => get<{ status: string; service: string; version: string }>('/'),

  status: async () => get<StatusResponse>('/status'),

  geocode: async (q: string, limit = 5) =>
    get<GeocodeResult[]>(
      `/geocode?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`
    ),

  forecast: (lat: number, lng: number, horizon_min = 60) =>
    post<ForecastResponse>('/forecast/segment', { lat, lng, horizon_min }),

  route: (from: Coord, to: Coord, depart_at_min = 0) =>
    post<RouteResponse>('/route/safe', { from, to, depart_at_min }),

  reportDepth: (image_base64: string, lat: number, lng: number) =>
    post<DepthReportResponse>('/report/depth', { image_base64, lat, lng }),
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
