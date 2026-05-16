import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { AlertsPanel } from './components/AlertsPanel'
import { DashboardShell } from './components/DashboardShell'
import { LandingScreen } from './components/LandingScreen'
import { LayersPanel } from './components/LayersPanel'
import { MapView } from './components/MapView'
import { PhotoReport } from './components/PhotoReport'
import { RouteInput } from './components/RouteInput'
import { RouteResults } from './components/RouteResults'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'

import { api } from './api/client'
import { useT } from './i18n/context'
import type { Coord, RouteResponse, StatusResponse } from './types'

const GlobeIntro = lazy(() =>
  import('./components/GlobeIntro').then((module) => ({
    default: module.GlobeIntro,
  }))
)

type Scene = 'landing' | 'dashboard'
type NavId = 'map' | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'
type Panel = null | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'

export default function App() {
  const { t } = useT()

  const [scene, setScene] = useState<Scene>('landing')
  const [activeNav, setActiveNav] = useState<NavId>('map')
  const [panel, setPanel] = useState<Panel>(null)

  const [from, setFrom] = useState<Coord | null>(null)
  const [to, setTo] = useState<Coord | null>(null)
  const [tapMode, setTapMode] = useState<'from' | 'to' | null>(null)

  const [result, setResult] = useState<RouteResponse | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)

  const [loading, setLoading] = useState(false)
  const [apiOk, setApiOk] = useState<boolean | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api.status()
      setStatus(next)
    } catch {
      // Keep last known status; health check handles API online/offline.
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

    const id = window.setInterval(() => {
      void refreshStatus()
    }, 30000)

    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [scene, refreshStatus])

  function handleContinue() {
    setScene('dashboard')
  }

  function handleNavSelect(id: NavId) {
    setActiveNav(id)

    if (id === 'map') {
      setPanel(null)
      return
    }

    setPanel(id)
  }

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
      const r = await api.route(from, to)
      setResult(r)
      setActiveNav('routes')
      setPanel('routes')
      void refreshStatus()
    } catch (err) {
      alert(err instanceof Error ? err.message : t.apiCallFailed)
    } finally {
      setLoading(false)
    }
  }

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
          className="h-screen w-screen overflow-hidden bg-slate-950"
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
          className="h-screen w-screen overflow-hidden bg-slate-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DashboardShell
            active={activeNav}
            onSelectNav={handleNavSelect}
            statsPanel={statsPanel}
            apiOk={apiOk}
          >
            <div className="relative h-screen w-screen overflow-hidden">
              <MapView
                from={from}
                to={to}
                segments={result?.segments}
                alternatives={result?.alternatives}
                onMapTap={handleMapTap}
                tapMode={tapMode}
              />

              {panel && (
                <div className="fixed bottom-4 left-20 right-4 z-30 md:bottom-auto md:left-auto md:right-6 md:top-24 md:w-[410px]">
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
                      />
                    ) : (
                      <RouteResults
                        result={result}
                        onClose={() => {
                          setResult(null)
                          setFrom(null)
                          setTo(null)
                          setPanel('routes')
                        }}
                      />
                    ))}

                  {panel === 'reports' && (
                    <PhotoReport
                      onClose={() => setPanel(null)}
                      onReported={() => void refreshStatus()}
                    />
                  )}

                  {panel === 'alerts' && (
                    <AlertsPanel
                      result={result}
                      status={status}
                      onClose={() => setPanel(null)}
                    />
                  )}

                  {panel === 'layers' && (
                    <LayersPanel
                      status={status}
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
                </div>
              )}
            </div>
          </DashboardShell>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
