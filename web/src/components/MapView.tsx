import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type {
  AlternativeRoute,
  Coord,
  LayerSettings,
  MapHotspot,
  RiderReport,
  RouteCandidate,
  RouteSegment,
  WeatherAlert,
} from '../types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const DEFAULT_LAYERS: LayerSettings = {
  routeSegments: true,
  alternatives: true,
  segmentNumbers: true,
  hotspots: true,
  reports: true,
  weatherAlerts: true,
}

const SEGMENT_COLORS: Record<string, string> = {
  low: '#10b981',
  moderate: '#f59e0b',
  high: '#f97316',
  severe: '#dc2626',
}

const PASSABILITY_LABEL: Record<string, string> = {
  safe: 'Safe',
  slow_pass: 'Pass slowly',
  avoid_for_motorbikes: 'Avoid for motorbikes',
  impassable: 'Impassable',
  unknown: 'Unknown',
}

interface Props {
  from: Coord | null
  to: Coord | null
  segments?: RouteSegment[]
  alternatives?: AlternativeRoute[]
  hotspots?: MapHotspot[]
  reports?: RiderReport[]
  weatherAlerts?: WeatherAlert[]
  layers?: LayerSettings
  routeOptions?: RouteCandidate[]
  selectedRouteId?: string | null
  onSelectRoute?: (routeId: string) => void
  onMapTap: (coord: Coord) => void
  tapMode: 'from' | 'to' | null
}

function scoreOf(seg: RouteSegment): number {
  const value =
    typeof seg.risk_score === 'number'
      ? seg.risk_score
      : typeof seg.flood_prob === 'number'
        ? seg.flood_prob
        : 0

  return Math.max(0, Math.min(1, value))
}

function coordsForSegment(seg: RouteSegment): Coord[] {
  if (seg.points && seg.points.length >= 2) return seg.points
  return [seg.start, seg.end]
}

function makePointMarker(label: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = label

  el.style.cssText = `
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${color};
    color: white;
    font-size: 14px;
    font-weight: 900;
    border: 3px solid white;
    box-shadow: 0 6px 16px rgba(0,0,0,0.35);
  `

  return el
}

function makeSmallMarker(label: string, color: string): HTMLElement {
  const el = document.createElement('div')
  const badge = document.createElement('div')

  badge.textContent = label

  el.style.cssText = `
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    cursor: pointer;
    touch-action: manipulation;
  `

  badge.style.cssText = `
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${color};
    color: white;
    font-size: 11px;
    font-weight: 900;
    border: 2px solid white;
    box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    pointer-events: none;
  `

  el.appendChild(badge)
  return el
}

function makeWeatherMarker(color: string): HTMLElement {
  const el = document.createElement('div')
  const badge = document.createElement('div')

  badge.textContent = 'W'

  el.style.cssText = `
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    cursor: pointer;
    touch-action: manipulation;
  `

  badge.style.cssText = `
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${color};
    color: white;
    font-size: 11px;
    font-weight: 900;
    border: 2px solid white;
    box-shadow: 0 3px 10px rgba(14,165,233,0.35);
    pointer-events: none;
  `

  el.appendChild(badge)
  return el
}

function evidenceOffsetMap(
  map: maplibregl.Map,
  points: Array<{ key: string; lat: number; lng: number }>
): Map<string, [number, number]> {
  const groups = new Map<string, Array<{ key: string; x: number; y: number }>>()

  points.forEach((point) => {
    const screenPoint = map.project([point.lng, point.lat])
    const groupKey = `${Math.round(screenPoint.x / 46)}:${Math.round(screenPoint.y / 46)}`
    const group = groups.get(groupKey) ?? []

    group.push({
      key: point.key,
      x: screenPoint.x,
      y: screenPoint.y,
    })

    groups.set(groupKey, group)
  })

  const offsets = new Map<string, [number, number]>()

  groups.forEach((group) => {
    const sorted = [...group].sort((a, b) => a.key.localeCompare(b.key))

    if (sorted.length === 1) {
      offsets.set(sorted[0].key, [0, 0])
      return
    }

    const radius = Math.min(42, 20 + sorted.length * 3)

    sorted.forEach((item, index) => {
      const angle = (Math.PI * 2 * index) / sorted.length - Math.PI / 2

      offsets.set(item.key, [
        Math.round(Math.cos(angle) * radius),
        Math.round(Math.sin(angle) * radius),
      ])
    })
  })

  return offsets
}

function popupHtml(title: string, rows: [string, string][]): string {
  const rowHtml = rows
    .map(
      ([k, v]) => `
      <div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px;">
        <span style="color:#64748b;">${k}</span>
        <b style="color:#0f172a;">${v}</b>
      </div>
    `
    )
    .join('')

  return `
    <div style="font-family:Inter,system-ui,sans-serif;min-width:220px;">
      <div style="font-size:14px;font-weight:900;color:#0f172a;margin-bottom:6px;">${title}</div>
      ${rowHtml}
    </div>
  `
}

function qualityLabel(value?: string): string {
  if (value === 'verified') return 'Verified'
  if (value === 'curated_seed') return 'Curated seed'
  return value || 'Curated seed'
}

function weatherColor(level?: string): string {
  if (level === 'high') return '#f97316'
  if (level === 'moderate') return '#f59e0b'
  return '#0ea5e9'
}

function relativeUpdate(ts?: number): string {
  if (!ts) return 'recent'

  const seconds = Math.max(0, Math.round(Date.now() / 1000 - ts))

  if (seconds < 90) return 'just now'

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) return `${minutes} min ago`

  return `${Math.round(minutes / 60)} hr ago`
}

function EvidenceLegend({
  showHotspots,
  showReports,
  showWeather,
}: {
  showHotspots: boolean
  showReports: boolean
  showWeather: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const pointerHandledRef = useRef(false)

  if (!showHotspots && !showReports && !showWeather) return null

  return (
    <div className="pointer-events-auto fixed bottom-24 left-3 z-[9999] flex max-w-[calc(100vw-24px)] flex-col-reverse items-start gap-2 sm:bottom-6">
      <button
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onPointerUp={(event) => {
          event.preventDefault()
          event.stopPropagation()
          pointerHandledRef.current = true
          setExpanded((value) => !value)
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (pointerHandledRef.current) {
            pointerHandledRef.current = false
            return
          }
          setExpanded((value) => !value)
        }}
        className="min-h-11 rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.24)] ring-1 ring-slate-200"
        aria-expanded={expanded}
      >
        Evidence
      </button>

      {expanded && (
        <div className="w-[min(240px,calc(100vw-24px))] rounded-xl bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          {showHotspots && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
                H
              </span>
              <span>Historical susceptibility</span>
            </div>
          )}

          {showWeather && (
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
                W
              </span>
              <span>Live rainfall forecast</span>
            </div>
          )}

          {showReports && (
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                R
              </span>
              <span>Rider report</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MapControlButton({
  label,
  ariaLabel,
  onPress,
}: {
  label: string
  ariaLabel: string
  onPress: () => void
}) {
  const pointerHandledRef = useRef(false)

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => {
        event.preventDefault()
        event.stopPropagation()
        pointerHandledRef.current = true
        onPress()
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (pointerHandledRef.current) {
          pointerHandledRef.current = false
          return
        }
        onPress()
      }}
      className="flex h-12 w-12 items-center justify-center bg-white text-3xl font-black leading-none text-slate-800 shadow-sm ring-1 ring-slate-200 first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50"
    >
      {label}
    </button>
  )
}

export function MapView({
  from,
  to,
  segments = [],
  alternatives = [],
  hotspots = [],
  reports = [],
  weatherAlerts = [],
  layers = DEFAULT_LAYERS,
  routeOptions = [],
  selectedRouteId = null,
  onSelectRoute,
  onMapTap,
  tapMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const pointMarkersRef = useRef<Marker[]>([])
  const segmentMarkersRef = useRef<Marker[]>([])
  const evidenceMarkersRef = useRef<Marker[]>([])
  const clickHandlerAttachedRef = useRef(false)
  const onSelectRouteRef = useRef<Props['onSelectRoute']>(undefined)
  const [markerLayoutTick, setMarkerLayoutTick] = useState(0)

  const activeLayers = useMemo(() => ({ ...DEFAULT_LAYERS, ...layers }), [layers])

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute
  }, [onSelectRoute])

  function zoomMap(delta: number) {
    const map = mapRef.current
    if (!map) return

    map.zoomTo(map.getZoom() + delta, {
      duration: 220,
      essential: true,
    })
  }

  function locateOnMap() {
    const map = mapRef.current
    if (!map || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), 14),
          duration: 700,
          essential: true,
        })
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [106.7009, 10.7769],
      zoom: 11,
      attributionControl: { compact: true },
    })

    const updateMarkerLayout = () => setMarkerLayoutTick((value) => value + 1)

    map.on('moveend', updateMarkerLayout)
    map.on('zoomend', updateMarkerLayout)

    mapRef.current = map

    return () => {
      map.off('moveend', updateMarkerLayout)
      map.off('zoomend', updateMarkerLayout)
      pointMarkersRef.current.forEach((m) => m.remove())
      segmentMarkersRef.current.forEach((m) => m.remove())
      evidenceMarkersRef.current.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handler = (e: maplibregl.MapMouseEvent) => {
      if (!tapMode) return
      onMapTap({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }

    map.on('click', handler)

    return () => {
      map.off('click', handler)
    }
  }, [onMapTap, tapMode])

  function ensureRouteLayers() {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return false

    if (!map.getSource('fw-alternatives')) {
      map.addSource('fw-alternatives', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
    }

    if (!map.getLayer('fw-alternatives-line')) {
      map.addLayer({
        id: 'fw-alternatives-line',
        type: 'line',
        source: 'fw-alternatives',
        paint: {
          'line-color': '#64748b',
          'line-width': 4,
          'line-opacity': 0.45,
          'line-dasharray': [2, 2],
        },
        layout: {
          visibility: activeLayers.alternatives ? 'visible' : 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
      })
    }

    if (!map.getSource('fw-route-segments')) {
      map.addSource('fw-route-segments', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
    }

    if (!map.getLayer('fw-route-segments-line')) {
      map.addLayer({
        id: 'fw-route-segments-line',
        type: 'line',
        source: 'fw-route-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 7,
          'line-opacity': 0.95,
        },
        layout: {
          visibility: activeLayers.routeSegments ? 'visible' : 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
      })
    }

    if (!clickHandlerAttachedRef.current) {
      map.on('click', 'fw-route-segments-line', (e: any) => {
        const feature = e.features?.[0]
        const p = feature?.properties

        if (!p) return

        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            popupHtml(`Segment ${p.index}`, [
              ['Risk', `${p.riskPct}%`],
              ['Passability', p.passability],
              ['Rain', p.rain],
              ['Tide', p.tide],
              ['River forecast', p.river],
              ['Hotspot', p.hotspot],
              ['Drainage risk', p.drainage],
              ['Reports', p.reports],
            ])
          )
          .addTo(map)
      })

      map.on('mouseenter', 'fw-route-segments-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      // fw-alternatives-line selectable click
      map.on('click', 'fw-alternatives-line', (e: any) => {
        const feature = e.features?.[0]
        const routeId = feature?.properties?.routeId

        if (routeId && onSelectRouteRef.current) {
          onSelectRouteRef.current(String(routeId))
        }
      })

      map.on('mouseenter', 'fw-alternatives-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'fw-alternatives-line', () => {
        map.getCanvas().style.cursor = ''
      })

      clickHandlerAttachedRef.current = true
    }

    return true
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const update = () => {
      if (!ensureRouteLayers()) return

      const segmentFeatures = segments.map((seg, index) => {
        const coords = coordsForSegment(seg)
        const s = scoreOf(seg)
        const e = seg.evidence

        return {
          type: 'Feature',
          properties: {
            index: String(index + 1),
            color: SEGMENT_COLORS[seg.risk_level] || '#10b981',
            riskPct: Math.round(s * 100),
            passability: PASSABILITY_LABEL[seg.passability] || seg.passability,
            rain: `${(e?.rainfall_mm ?? 0).toFixed(1)}mm`,
            tide:
              e?.tide_level_m === null || e?.tide_level_m === undefined
                ? 'n/a'
                : `${e.tide_level_m.toFixed(2)}m`,
            river:
              e?.river_discharge_ratio === null || e?.river_discharge_ratio === undefined
                ? 'n/a'
                : `${e.river_discharge_ratio.toFixed(2)}x`,
            hotspot: `${Math.round((e?.hotspot_proximity ?? 0) * 100)}%`,
            drainage:
              e?.drainage_score === null || e?.drainage_score === undefined
                ? 'n/a'
                : `${Math.round((1 - e.drainage_score) * 100)}%`,
            reports: String(e?.report_count ?? 0),
          },
          geometry: {
            type: 'LineString',
            coordinates: coords.map((c) => [c.lng, c.lat]),
          },
        }
      })

      const inactiveRouteOptions = routeOptions.filter(
        (route) => route.id !== selectedRouteId
      )

      const altFeatures =
        inactiveRouteOptions.length > 0
          ? inactiveRouteOptions.map((route, index) => ({
              type: 'Feature',
              properties: {
                index: String(index + 1),
                routeId: route.id,
                risk: route.overall_risk,
              },
              geometry: {
                type: 'LineString',
                coordinates: route.points.map((c) => [c.lng, c.lat]),
              },
            }))
          : alternatives.map((alt, index) => ({
              type: 'Feature',
              properties: {
                index: String(index + 1),
                routeId: alt.route_id ?? '',
                risk: alt.overall_risk,
              },
              geometry: {
                type: 'LineString',
                coordinates: alt.points.map((c) => [c.lng, c.lat]),
              },
            }))

      const segmentSource = map.getSource('fw-route-segments') as maplibregl.GeoJSONSource
      const altSource = map.getSource('fw-alternatives') as maplibregl.GeoJSONSource

      segmentSource?.setData({
        type: 'FeatureCollection',
        features: segmentFeatures,
      } as any)

      altSource?.setData({
        type: 'FeatureCollection',
        features: altFeatures,
      } as any)
    }

    if (map.isStyleLoaded()) update()
    else map.once('load', update)
  }, [segments, alternatives, routeOptions, selectedRouteId, activeLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.isStyleLoaded()) return

    if (map.getLayer('fw-route-segments-line')) {
      map.setLayoutProperty(
        'fw-route-segments-line',
        'visibility',
        activeLayers.routeSegments ? 'visible' : 'none'
      )
    }

    if (map.getLayer('fw-alternatives-line')) {
      map.setLayoutProperty(
        'fw-alternatives-line',
        'visibility',
        activeLayers.alternatives ? 'visible' : 'none'
      )
    }
  }, [activeLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    pointMarkersRef.current.forEach((m) => m.remove())
    pointMarkersRef.current = []

    if (from) {
      pointMarkersRef.current.push(
        new maplibregl.Marker({
          element: makePointMarker('A', '#0ea5e9'),
          anchor: 'center',
        })
          .setLngLat([from.lng, from.lat])
          .addTo(map)
      )
    }

    if (to) {
      pointMarkersRef.current.push(
        new maplibregl.Marker({
          element: makePointMarker('B', '#ef4444'),
          anchor: 'center',
        })
          .setLngLat([to.lng, to.lat])
          .addTo(map)
      )
    }
  }, [from, to])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    segmentMarkersRef.current.forEach((m) => m.remove())
    segmentMarkersRef.current = []

    if (!activeLayers.segmentNumbers) return

    segments.forEach((seg, index) => {
      const pts = coordsForSegment(seg)
      const mid = pts[Math.floor(pts.length / 2)]
      if (!mid) return

      const marker = new maplibregl.Marker({
        element: makeSmallMarker(String(index + 1), SEGMENT_COLORS[seg.risk_level] || '#10b981'),
        anchor: 'center',
      })
        .setLngLat([mid.lng, mid.lat])
        .addTo(map)

      segmentMarkersRef.current.push(marker)
    })
  }, [segments, activeLayers.segmentNumbers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    evidenceMarkersRef.current.forEach((m) => m.remove())
    evidenceMarkersRef.current = []

    const evidenceOffsets = evidenceOffsetMap(map, [
      ...(activeLayers.hotspots
        ? hotspots.map((h) => ({
            key: `h:${h.id}`,
            lat: h.lat,
            lng: h.lng,
          }))
        : []),
      ...(activeLayers.weatherAlerts
        ? weatherAlerts.map((w) => ({
            key: `w:${w.id}`,
            lat: w.lat,
            lng: w.lng,
          }))
        : []),
      ...(activeLayers.reports
        ? reports.map((r) => ({
            key: `r:${r.id}`,
            lat: r.lat,
            lng: r.lng,
          }))
        : []),
    ])

    if (activeLayers.hotspots) {
      hotspots.forEach((h) => {
        const marker = new maplibregl.Marker({
          element: makeSmallMarker('H', '#eab308'),
          anchor: 'center',
          offset: evidenceOffsets.get(`h:${h.id}`) ?? [0, 0],
        })
          .setLngLat([h.lng, h.lat])
          .setPopup(
            new maplibregl.Popup().setHTML(
              popupHtml(h.name, [
                ['Type', 'Historical flood susceptibility'],
                ['City', h.city_name || h.city_id || 'Vietnam'],
                ['Frequency', `${Math.round((h.historical_freq ?? 0) * 100)}%`],
                ['Evidence', 'Not a live flood report'],
                ['Quality', qualityLabel(h.data_quality)],
                ['Source', h.source || 'curated seed'],
              ])
            )
          )
          .addTo(map)

        evidenceMarkersRef.current.push(marker)
      })
    }

    if (activeLayers.weatherAlerts) {
      weatherAlerts.forEach((w) => {
        const marker = new maplibregl.Marker({
          element: makeWeatherMarker(weatherColor(w.alert_level)),
          anchor: 'center',
          offset: evidenceOffsets.get(`w:${w.id}`) ?? [-24, 0],
        })
          .setLngLat([w.lng, w.lat])
          .setPopup(
            new maplibregl.Popup().setHTML(
              popupHtml(w.name, [
                ['Type', 'Rainfall forecast watch'],
                ['Next 30 min', `${w.rain_30m_mm.toFixed(1)} mm`],
                ['Next 90 min', `${w.rain_90m_mm.toFixed(1)} mm`],
                ['Rain chance', `${w.precip_probability_pct}%`],
                ['Level', w.alert_level],
                ['Evidence', 'Weather forecast, not flood report'],
                ['Updated', relativeUpdate(w.updated_at)],
                ['Source', w.source],
              ])
            )
          )
          .addTo(map)

        evidenceMarkersRef.current.push(marker)
      })
    }

    if (activeLayers.reports) {
      reports.forEach((r) => {
        const color =
          r.passability === 'impassable'
            ? '#dc2626'
            : r.passability === 'avoid_for_motorbikes'
              ? '#f97316'
              : r.passability === 'slow_pass'
                ? '#f59e0b'
                : '#0ea5e9'

        const marker = new maplibregl.Marker({
          element: makeSmallMarker('R', color),
          anchor: 'center',
          offset: evidenceOffsets.get(`r:${r.id}`) ?? [0, 0],
        })
          .setLngLat([r.lng, r.lat])
          .setPopup(
            new maplibregl.Popup().setHTML(
              popupHtml(`Rider report ${r.id}`, [
                ['Type', 'Live rider report'],
                ['Passability', PASSABILITY_LABEL[r.passability] || r.passability],
                ['Confidence', `${Math.round(r.confidence * 100)}%`],
                ['Photo', r.photo_confirmed ? 'confirmed' : 'not confirmed'],
              ])
            )
          )
          .addTo(map)

        evidenceMarkersRef.current.push(marker)
      })
    }
  }, [
    hotspots,
    reports,
    weatherAlerts,
    activeLayers.hotspots,
    activeLayers.reports,
    activeLayers.weatherAlerts,
    markerLayoutTick,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const coords: Coord[] = []

    segments.forEach((s) => coords.push(...coordsForSegment(s)))
    alternatives.forEach((a) => coords.push(...a.points))

    if (coords.length === 0) {
      if (from && to) coords.push(from, to)
      else if (from) coords.push(from)
      else if (to) coords.push(to)
    }

    if (coords.length === 0) return

    if (coords.length === 1) {
      map.flyTo({
        center: [coords[0].lng, coords[0].lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 900,
        essential: true,
      })
      return
    }

    const bounds = new maplibregl.LngLatBounds()

    coords.forEach((c) => bounds.extend([c.lng, c.lat]))

    map.fitBounds(bounds, {
      padding: { top: 90, right: 460, bottom: 80, left: 110 },
      maxZoom: 15,
      duration: 900,
    })
  }, [from, to, segments, alternatives])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {tapMode && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-bold text-white shadow-xl">
          Click the map to pick {tapMode === 'from' ? 'FROM' : 'TO'}
        </div>
      )}

      <div className="pointer-events-auto absolute right-3 top-24 z-40 flex flex-col overflow-hidden rounded-xl shadow-[0_10px_24px_rgba(15,23,42,0.22)]">
        <MapControlButton
          label="+"
          ariaLabel="Zoom in"
          onPress={() => zoomMap(1)}
        />
        <MapControlButton
          label="-"
          ariaLabel="Zoom out"
          onPress={() => zoomMap(-1)}
        />
      </div>

      <div className="pointer-events-auto absolute right-3 top-[218px] z-40 overflow-hidden rounded-xl shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
        <MapControlButton
          label="◎"
          ariaLabel="Use current location"
          onPress={locateOnMap}
        />
      </div>

      <EvidenceLegend
        showHotspots={activeLayers.hotspots}
        showReports={activeLayers.reports}
        showWeather={activeLayers.weatherAlerts}
      />
    </div>
  )
}
