import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { Coord, RouteSegment, AlternativeRoute } from '../types'
import { useT } from '../i18n/context'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const VIETNAM_CENTER: [number, number] = [106.5, 16.0]
const VIETNAM_ZOOM = 4.6

const SEGMENT_COLORS: Record<string, string> = {
  low: '#10b981', moderate: '#f59e0b', high: '#f97316', severe: '#dc2626',
}

const TIER_COLORS: Record<number, string> = { 1: '#dc2626', 2: '#f59e0b' }

interface PilotCity {
  id: string
  name_vi: string
  name_en: string
  center: { lat: number; lng: number }
  radius_km: number
  tier: number
  coastal: boolean
}

interface Props {
  from?: Coord | null
  to?: Coord | null
  segments?: RouteSegment[]
  /** Rejected/alternative routes — drawn dimmed UNDER the chosen route. */
  alternatives?: AlternativeRoute[]
  onMapTap?: (coord: Coord) => void
  tapMode?: 'from' | 'to' | null
  onCityClick?: (city: PilotCity) => void
}

export function MapView({
  from, to, segments, alternatives, onMapTap, tapMode, onCityClick,
}: Props) {
  const { t, lang } = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null)
  const toMarkerRef = useRef<maplibregl.Marker | null>(null)
  const cityMarkersRef = useRef<maplibregl.Marker[]>([])
  const [pilotCities, setPilotCities] = useState<PilotCity[]>([])

  useEffect(() => {
    fetch(`${API_BASE}/coverage`)
      .then((r) => r.json())
      .then((data) => setPilotCities(data.pilot_cities ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: VIETNAM_CENTER,
      zoom: VIETNAM_ZOOM,
      maxZoom: 18,
      minZoom: 4,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    )

    map.on('load', () => {
      // Alternatives source/layer — added FIRST so they render under the chosen route
      map.addSource('route-alts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'route-alts-line', type: 'line', source: 'route-alts',
        paint: {
          'line-color': '#9ca3af',
          'line-width': 4,
          'line-opacity': 0.55,
          'line-dasharray': [2, 2],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // Chosen route — added AFTER so it renders on top
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      map.addSource('coverage', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer(
        {
          id: 'coverage-fill', type: 'circle', source: 'coverage',
          paint: {
            'circle-radius': ['get', 'radius_px'],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.10,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.5,
          },
        },
        'route-alts-line'
      )
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Coverage circles + city pin markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || pilotCities.length === 0) return

    const renderCoverage = () => {
      const src = map.getSource('coverage') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      const zoom = map.getZoom()
      const features = pilotCities.map((c) => {
        const pxPerKm =
          (Math.pow(2, zoom) * 256) /
          (40075 * Math.cos((c.center.lat * Math.PI) / 180))
        const radius_px = c.radius_km * pxPerKm
        return {
          type: 'Feature' as const,
          properties: {
            id: c.id,
            color: TIER_COLORS[c.tier] || '#6b7280',
            radius_px: Math.max(8, Math.min(120, radius_px)),
          },
          geometry: { type: 'Point' as const, coordinates: [c.center.lng, c.center.lat] },
        }
      })
      src.setData({ type: 'FeatureCollection', features })
    }
    if (map.isStyleLoaded()) renderCoverage()
    else map.once('load', renderCoverage)
    map.on('zoom', renderCoverage)

    cityMarkersRef.current.forEach((m) => m.remove())
    cityMarkersRef.current = []
    for (const city of pilotCities) {
      const el = document.createElement('div')
      const isTier1 = city.tier === 1
      el.className = 'city-marker'
      el.style.cssText = `
        width: ${isTier1 ? 14 : 10}px;
        height: ${isTier1 ? 14 : 10}px;
        border-radius: 50%;
        background: ${TIER_COLORS[city.tier]};
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      `

      if (isTier1) {
        const ring = document.createElement('div')
        ring.style.cssText = `
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          background: ${TIER_COLORS[city.tier]};
          opacity: 0.4;
          animation: city-pulse 2s infinite;
        `
        el.style.position = 'relative'
        el.appendChild(ring)
      }

      el.title = lang === 'vi' ? city.name_vi : city.name_en

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        if (onCityClick) onCityClick(city)
        else {
          map.flyTo({ center: [city.center.lng, city.center.lat], zoom: 11, duration: 1500 })
        }
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([city.center.lng, city.center.lat])
        .addTo(map)
      cityMarkersRef.current.push(marker)
    }

    return () => {
      map.off('zoom', renderCoverage)
    }
  }, [pilotCities, lang, onCityClick])

  // Tap handler
  useEffect(() => {
    const map = mapRef.current
    if (!map || !onMapTap || !tapMode) return
    const handler = (e: maplibregl.MapMouseEvent) => {
      onMapTap({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
    map.on('click', handler)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', handler)
      map.getCanvas().style.cursor = ''
    }
  }, [onMapTap, tapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (fromMarkerRef.current) fromMarkerRef.current.remove()
    if (from) {
      fromMarkerRef.current = new maplibregl.Marker({ color: '#0ea5e9' })
        .setLngLat([from.lng, from.lat]).addTo(map)
    }
  }, [from])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (toMarkerRef.current) toMarkerRef.current.remove()
    if (to) {
      toMarkerRef.current = new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([to.lng, to.lat]).addTo(map)
    }
  }, [to])

  // Chosen route segments — drawn on top
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      const features = (segments ?? []).map((s) => {
        const coords =
          s.points && s.points.length >= 2
            ? s.points.map((p) => [p.lng, p.lat])
            : [
                [s.start.lng, s.start.lat],
                [s.end.lng, s.end.lat],
              ]
        return {
          type: 'Feature' as const,
          properties: { color: SEGMENT_COLORS[s.risk_level] || '#6b7280' },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        }
      })
      src.setData({ type: 'FeatureCollection', features })
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [segments])

  // Alternatives — drawn UNDER, dimmed dashed
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource('route-alts') as maplibregl.GeoJSONSource | undefined
      if (!src) return
      const features = (alternatives ?? [])
        .filter((a) => a.points && a.points.length >= 2)
        .map((a) => ({
          type: 'Feature' as const,
          properties: { is_fastest: a.is_fastest },
          geometry: {
            type: 'LineString' as const,
            coordinates: a.points.map((p) => [p.lng, p.lat]),
          },
        }))
      src.setData({ type: 'FeatureCollection', features })
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [alternatives])

  // Fit bounds: include chosen route AND any alternatives
  useEffect(() => {
    const map = mapRef.current
    if (!map || !from || !to) return
    const bounds = new maplibregl.LngLatBounds()
    bounds.extend([from.lng, from.lat])
    bounds.extend([to.lng, to.lat])
    if (segments) {
      for (const s of segments) {
        if (s.points) for (const p of s.points) bounds.extend([p.lng, p.lat])
      }
    }
    if (alternatives) {
      for (const a of alternatives) {
        for (const p of a.points) bounds.extend([p.lng, p.lat])
      }
    }
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 })
  }, [from, to, segments, alternatives])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {tapMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-brand text-white px-3 py-1.5 rounded-full text-sm shadow-lg z-10">
          {tapMode === 'from' ? t.tapMapToPickFrom : t.tapMapToPickTo}
        </div>
      )}
    </div>
  )
}