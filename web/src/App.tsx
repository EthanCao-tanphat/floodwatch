import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LandingScreen } from './components/LandingScreen'
import { DashboardShell } from './components/DashboardShell'
import { MapView } from './components/MapView'
import { RouteInput } from './components/RouteInput'
import { RouteResults } from './components/RouteResults'
import { PhotoReport } from './components/PhotoReport'
import { StatsPanel } from './components/StatsPanel'
import { api } from './api/client'
import { useT } from './i18n/context'
import type { Coord, RouteResponse } from './types'

const LANDING_SEEN_KEY = 'floodwatch.landing.seen'

type Scene = 'landing' | 'dashboard'
type NavId = 'map' | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'
type Panel = null | 'routes' | 'reports'

export default function App() {
  const { t } = useT()

  const [scene, setScene] = useState<Scene>(() =>
    localStorage.getItem(LANDING_SEEN_KEY) === '1' ? 'dashboard' : 'landing'
  )

  const [activeNav, setActiveNav] = useState<NavId>('map')
  const [panel, setPanel] = useState<Panel>(null)

  // Route state
  const [from, setFrom] = useState<Coord | null>(null)
  const [to, setTo] = useState<Coord | null>(null)
  const [tapMode, setTapMode] = useState<'from' | 'to' | null>(null)
  const [result, setResult] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const [apiOk, setApiOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (scene !== 'dashboard') return
    api.health().then(() => setApiOk(true)).catch(() => setApiOk(false))
  }, [scene])

  function handleContinue() {
    localStorage.setItem(LANDING_SEEN_KEY, '1')
    setScene('dashboard')
  }

  function handleNavSelect(id: NavId) {
    setActiveNav(id)
    if (id === 'routes') setPanel('routes')
    else if (id === 'reports') setPanel('reports')
    else setPanel(null)
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
    } catch (err) {
      alert(err instanceof Error ? err.message : t.apiCallFailed)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {scene === 'landing' && (
        <motion.div key="landing" exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
          <LandingScreen onContinue={handleContinue} />
        </motion.div>
      )}

      {scene === 'dashboard' && (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="h-full w-full"
        >
          <DashboardShell
            active={activeNav}
            onSelectNav={handleNavSelect}
            statsPanel={<StatsPanel />}
            apiOk={apiOk}
          >
            <MapView
              from={from}
              to={to}
              segments={result?.segments}
              onMapTap={handleMapTap}
              tapMode={tapMode}
            />

            {/* Floating panels — anchored to bottom-left on mobile, right side on desktop */}
            <div className="absolute right-4 top-4 bottom-4 w-full max-w-sm pointer-events-none flex flex-col gap-3">
              {panel === 'routes' && (
                <div className="pointer-events-auto">
                  {!result ? (
                    <RouteInput
                      from={from}
                      to={to}
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
                      }}
                    />
                  )}
                </div>
              )}

              {panel === 'reports' && (
                <div className="pointer-events-auto">
                  <PhotoReport onClose={() => setPanel(null)} />
                </div>
              )}
            </div>
          </DashboardShell>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
