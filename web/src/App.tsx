import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { AlertsPanel } from './components/AlertsPanel'
import { DashboardShell } from './components/DashboardShell'
import { FloatingPanel } from './components/FloatingPanel'
import { LandingScreen } from './components/LandingScreen'
import { LayersPanel } from './components/LayersPanel'
import { MapView } from './components/MapView'
import { PhotoReport } from './components/PhotoReport'
import { RouteInput } from './components/RouteInput'
import { RouteChoices } from './components/RouteChoices'
import { RouteResults } from './components/RouteResults'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'

import { api } from './api/client'
import { useT } from './i18n/context'
import type { Coord, LayerKey, LayerSettings, MapEvidenceResponse, RouteCandidate, RouteResponse, StatusResponse, TravelMode } from './types'

const GlobeIntro = lazy(() =>
  import('./components/GlobeIntro').then((module) => ({
    default: module.GlobeIntro,
  }))
)

type Scene = 'landing' | 'dashboard'
type NavId = 'map' | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'
type Panel = null | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'

const DEFAULT_LAYERS: LayerSettings = {
  routeSegments: true,
  alternatives: true,
  segmentNumbers: true,
  hotspots: true,
  reports: true,
  weatherAlerts: true,
}

function responseFromRouteCandidate(
  base: RouteResponse,
  selected: RouteCandidate
): RouteResponse {
  return {
    ...base,
    distance_km: selected.distance_km,
    eta_min: selected.eta_min,
    segments: selected.segments,
    overall_risk: selected.overall_risk,
    overall_passability: selected.overall_passability,
    confidence: selected.confidence,
    evidence_state: selected.evidence_state,
    evidence_summary: selected.evidence_summary,
    calibration_flags: selected.calibration_flags,
    recommendation: selected.recommendation,
    selected_route_id: selected.id,

    timeline: selected.timeline ?? [],
    future_peak_risk: selected.future_peak_risk,
    future_peak_min: selected.future_peak_min,
    future_risk_summary: selected.future_risk_summary,
    route_score: selected.route_score,
    travel_mode: selected.travel_mode,

    alternatives: (base.routes ?? [])
      .filter((r) => r.id !== selected.id)
      .map((r) => ({
        distance_km: r.distance_km,
        eta_min: r.eta_min,
        overall_risk: r.overall_risk,
        flood_prob_max: r.flood_prob_max,
        points: r.points,
        is_fastest: r.is_fastest,
        route_id: r.id,
      })),
  }
}

export default function App() {
  const { t } = useT()

  const [scene, setScene] = useState<Scene>('landing')
  const [activeNav, setActiveNav] = useState<NavId>('map')
  const [panel, setPanel] = useState<Panel>(null)

  const [from, setFrom] = useState<Coord | null>(null)
  const [to, setTo] = useState<Coord | null>(null)
  const [tapMode, setTapMode] = useState<'from' | 'to' | null>(null)
  const [travelMode, setTravelMode] = useState<TravelMode>('motorbike')

  const [result, setResult] = useState<RouteResponse | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [mapEvidence, setMapEvidence] = useState<MapEvidenceResponse | null>(null)
  const [layers, setLayers] = useState<LayerSettings>(DEFAULT_LAYERS)

  const [loading, setLoading] = useState(false)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [routeSheetExpanded, setRouteSheetExpanded] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api.status()
      setStatus(next)
    } catch {
      // Keep last known status; health check handles API online/offline.
    }
  }, [])

  const refreshMapEvidence = useCallback(async () => {
    try {
      const next = await api.mapEvidence()
      setMapEvidence(next)
    } catch {
      // Keep last known evidence if the API hiccups.
    }
  }, [])

  useEffect(() => {
    if (scene !== 'dashboard') return

    let alive = true

    api
      .health()
      .then(() => {
        if (alive) setApiOk(true)
      })
      .catch(() => {
        if (alive) setApiOk(false)
      })

    void refreshStatus()
    void refreshMapEvidence()

    const statusIntervalId = window.setInterval(() => {
      void refreshStatus()
    }, 60000)

    const evidenceIntervalId = window.setInterval(() => {
      void refreshMapEvidence()
    }, 600000)

    return () => {
      alive = false
      window.clearInterval(statusIntervalId)
      window.clearInterval(evidenceIntervalId)
    }
  }, [scene, refreshStatus, refreshMapEvidence])

  function handleContinue() {
    setScene('dashboard')
  }

  function handleNavSelect(id: NavId) {
    setActiveNav(id)
    setRouteSheetExpanded(false)

    if (id === 'map') {
      setPanel(null)
      return
    }

    setPanel(id)
  }

  const handleSheetHeightChange = useCallback((heightVh: number) => {
    setRouteSheetExpanded(heightVh >= 72)
  }, [])

  function handleMapTap(coord: Coord) {
    if (tapMode === 'from') setFrom(coord)
    else if (tapMode === 'to') setTo(coord)

    setTapMode(null)
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (p) => setFrom({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => alert(t.geolocationFailed),
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }

  async function submitRoute() {
    if (!from || !to) return

    setLoading(true)

    try {
      const r = await api.route(from, to, 0, travelMode)
      setResult(r)
      setSelectedRouteId(
        r.selected_route_id ??
          r.recommended_route_id ??
          r.routes?.[0]?.id ??
          null
      )
      setActiveNav('routes')
      setPanel('routes')
      void refreshStatus()
    } catch (err) {
      alert(err instanceof Error ? err.message : t.apiCallFailed)
    } finally {
      setLoading(false)
    }
  }

  function toggleLayer(key: LayerKey) {
    setLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const selectedRoute =
    result?.routes?.find((route) => route.id === selectedRouteId) ?? null

  const visibleResult =
    result && selectedRoute
      ? responseFromRouteCandidate(result, selectedRoute)
      : result

  const statsPanel = (
    <StatsPanel
      activeReports={status?.active_reports ?? 0}
      floodHotspots={status?.flood_hotspots ?? 0}
      rainNowMm={status?.rain_now_mm ?? 0}
      tideLevelM={status?.tide_level_m ?? 0}
      coveragePct={status?.coverage_pct ?? 100}
    />
  )

  return (
    <AnimatePresence mode="wait">
      {scene === 'landing' && (
        <motion.div
          key="landing"
          className="app-screen bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Suspense fallback={<LandingScreen onContinue={handleContinue} />}>
            <GlobeIntro onContinue={handleContinue} />
          </Suspense>
        </motion.div>
      )}

      {scene === 'dashboard' && (
        <motion.div
          key="dashboard"
          className="app-screen bg-slate-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DashboardShell
            active={activeNav}
            onSelectNav={handleNavSelect}
            statsPanel={statsPanel}
            apiOk={apiOk}
            hideMobileQuickActions={panel === 'routes' && routeSheetExpanded}
          >
            <div className="app-screen relative">
              <MapView
                from={from}
                to={to}
                segments={visibleResult?.segments}
                alternatives={visibleResult?.alternatives}
                hotspots={mapEvidence?.hotspots ?? []}
                reports={mapEvidence?.reports ?? []}
                weatherAlerts={mapEvidence?.weather_alerts ?? []}
                layers={layers}
                routeOptions={result?.routes ?? []}
                selectedRouteId={selectedRouteId}
                onSelectRoute={(routeId) => setSelectedRouteId(routeId)}
                onMapTap={handleMapTap}
                tapMode={tapMode}
              />

              {panel && (
                <FloatingPanel
                  title="FloodWatch route panel"
                  defaultHeightVh={panel === 'routes' && result ? 38 : 58}
                  minHeightVh={panel === 'routes' ? 24 : 42}
                  midHeightVh={panel === 'routes' && result ? 54 : 58}
                  maxHeightVh={88}
                  snapKey={`${panel}-${result ? 'result' : 'input'}`}
                  dismissOnMin={panel === 'routes' && !result}
                  onDismiss={() => {
                    if (panel === 'routes' && !result) {
                      setPanel(null)
                      setActiveNav('map')
                      setTapMode(null)
                      setRouteSheetExpanded(false)
                    }
                  }}
                  onHeightChange={handleSheetHeightChange}
                >
                  {panel === 'routes' &&
                    (!result ? (
                      <RouteInput
                        from={from}
                        to={to}
                        onSetFrom={setFrom}
                        onSetTo={setTo}
                        onPickFrom={() => setTapMode('from')}
                        onPickTo={() => setTapMode('to')}
                        onUseCurrentLocation={useCurrentLocation}
                        onSubmit={submitRoute}
                        loading={loading}
                        travelMode={travelMode}
                        onSetTravelMode={setTravelMode}
                        status={status}
                      />
                    ) : (
                      <div className="space-y-3">
                        <RouteChoices
                          routes={result.routes ?? []}
                          selectedRouteId={selectedRouteId}
                          recommendedRouteId={result.recommended_route_id}
                          coverage={result.coverage}
                          onSelectRoute={setSelectedRouteId}
                        />

                        <RouteResults
                          result={visibleResult ?? result}
                          onClose={() => {
                            setResult(null)
                            setSelectedRouteId(null)
                            setFrom(null)
                            setTo(null)
                            setPanel('routes')
                          }}
                        />
                      </div>
                    ))}

                  {panel === 'reports' && (
                    <PhotoReport
                      onClose={() => setPanel(null)}
                      onReported={() => {
                        void refreshStatus()
                        void refreshMapEvidence()
                      }}
                    />
                  )}

                  {panel === 'alerts' && (
                    <AlertsPanel
                      result={visibleResult}
                      status={status}
                      onClose={() => setPanel(null)}
                    />
                  )}

                  {panel === 'layers' && (
                    <LayersPanel
                      status={status}
                      layers={layers}
                      onToggleLayer={toggleLayer}
                      onClose={() => setPanel(null)}
                    />
                  )}

                  {panel === 'settings' && (
                    <SettingsPanel
                      apiOk={apiOk}
                      status={status}
                      onClose={() => setPanel(null)}
                    />
                  )}
                </FloatingPanel>
              )}
            </div>
          </DashboardShell>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
