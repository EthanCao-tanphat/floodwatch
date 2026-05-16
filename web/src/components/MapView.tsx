import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type {
  AlternativeRoute,
  Coord,
  LayerSettings,
  MapHotspot,
  RiderReport,
  RouteSegment,
} from '../types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const DEFAULT_LAYERS: LayerSettings = {
  routeSegments: true,
  alternatives: true,
  segmentNumbers: true,
  hotspots: true,
  reports: true,
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
  layers?: LayerSettings
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
  el.textContent = label

  el.style.cssText = `
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
  `

  return el
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

export function MapView({
  from,
  to,
  segments = [],
  alternatives = [],
  hotspots = [],
  reports = [],
  layers = DEFAULT_LAYERS,
  onMapTap,
  tapMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const pointMarkersRef = useRef<Marker[]>([])
  const segmentMarkersRef = useRef<Marker[]>([])
  const evidenceMarkersRef = useRef<Marker[]>([])
  const clickHandlerAttachedRef = useRef(false)

  const activeLayers = useMemo(() => ({ ...DEFAULT_LAYERS, ...layers }), [layers])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [106.7009, 10.7769],
      zoom: 11,
      attributionControl: { compact: true },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right')

    mapRef.current = map

    return () => {
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

      map.on('mouseleave', 'fw-route-segments-line', () => {
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

      const altFeatures = alternatives.map((alt, index) => ({
        type: 'Feature',
        properties: {
          index: String(index + 1),
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
  }, [segments, alternatives, activeLayers])

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

    if (activeLayers.hotspots) {
      hotspots.forEach((h) => {
        const marker = new maplibregl.Marker({
          element: makeSmallMarker('H', '#eab308'),
          anchor: 'center',
        })
          .setLngLat([h.lng, h.lat])
          .setPopup(
            new maplibregl.Popup().setHTML(
              popupHtml(h.name, [
                ['Type', 'Historical hotspot'],
                ['Frequency', `${Math.round((h.historical_freq ?? 0) * 100)}%`],
                ['Source', h.source || 'curated'],
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
        })
          .setLngLat([r.lng, r.lat])
          .setPopup(
            new maplibregl.Popup().setHTML(
              popupHtml(`Rider report ${r.id}`, [
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
  }, [hotspots, reports, activeLayers.hotspots, activeLayers.reports])

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
    </div>
  )
}
