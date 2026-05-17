import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useT } from '../i18n/context'
import { LangToggle } from './LangToggle'
import {
  AlertIcon,
  CameraIcon,
  CloudRainIcon,
  MapIcon,
  RouteIcon,
  SettingsIcon,
  WaveIcon,
} from './icons'

type NavId = 'map' | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'

interface NavItem {
  id: NavId
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  labelKey:
    | 'navMap'
    | 'navRoutes'
    | 'navReports'
    | 'navAlerts'
    | 'navLayers'
    | 'navSettings'
}

const NAV_ITEMS: NavItem[] = [
  { id: 'map', Icon: MapIcon, labelKey: 'navMap' },
  { id: 'routes', Icon: RouteIcon, labelKey: 'navRoutes' },
  { id: 'reports', Icon: CameraIcon, labelKey: 'navReports' },
  { id: 'alerts', Icon: AlertIcon, labelKey: 'navAlerts' },
  { id: 'layers', Icon: CloudRainIcon, labelKey: 'navLayers' },
  { id: 'settings', Icon: SettingsIcon, labelKey: 'navSettings' },
]

interface Props {
  children: ReactNode
  active: NavId
  onSelectNav: (id: NavId) => void
  statsPanel?: ReactNode
  apiOk: boolean | null
}

export function DashboardShell({
  children,
  active,
  onSelectNav,
  statsPanel,
  apiOk,
}: Props) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <motion.aside
        className="fixed inset-y-0 left-0 z-50 flex text-white"
        onMouseEnter={() => setExpanded(true)}
      >
        <div className="flex h-screen w-16 shrink-0 flex-col items-center border-r border-white/10 bg-slate-950/95 px-2 py-4 shadow-2xl backdrop-blur">
          <button
            onClick={() => setExpanded((value) => !value)}
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/20"
            aria-label="Toggle menu"
          >
            <WaveIcon className="h-7 w-7" />
          </button>

          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.Icon
              const isActive = active === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectNav(item.id)}
                  aria-label={t[item.labelKey]}
                  className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-[-8px] h-8 w-1 rounded-full bg-cyan-400" />
                  )}

                  <Icon className="h-6 w-6" />
                </button>
              )
            })}
          </nav>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex h-screen w-80 max-w-[calc(100vw-4rem)] flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 pb-6">
                <div className="mb-8">
                  <h1 className="text-3xl font-black tracking-tight">
                    FloodWatch
                  </h1>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                    Flood prediction system for Vietnam
                  </p>
                </div>

                <div className="mb-8">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Navigation
                  </p>

                  <div className="space-y-2">
                    {NAV_ITEMS.map((item) => {
                      const Icon = item.Icon
                      const isActive = active === item.id

                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelectNav(item.id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            isActive
                              ? 'bg-cyan-500/10 text-cyan-100 ring-1 ring-cyan-400/30'
                              : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-sm font-semibold">
                            {t[item.labelKey]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {statsPanel && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                      System status
                    </p>
                    {statsPanel}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        apiOk === true
                          ? 'bg-emerald-400'
                          : apiOk === false
                            ? 'bg-red-400'
                            : 'bg-amber-400'
                      }`}
                    />
                    <span>
                      {apiOk === true
                        ? 'API online'
                        : apiOk === false
                          ? 'API offline'
                          : 'connecting…'}
                    </span>
                  </div>

                  <LangToggle />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {children}
    </div>
  )
}
