/**
 * DashboardShell — sidebar shell with icon strip + expandable panel.
 * Drop at:  web/src/components/DashboardShell.tsx
 */
import { useState, type ReactNode, type ComponentType, type SVGProps } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../i18n/context'
import { LangToggle } from './LangToggle'
import {
  WaveIcon,
  MapIcon,
  RouteIcon,
  CameraIcon,
  AlertIcon,
  CloudRainIcon,
  SettingsIcon,
} from './icons'

type NavId = 'map' | 'routes' | 'reports' | 'alerts' | 'layers' | 'settings'

interface NavItem {
  id: NavId
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  labelKey: 'navMap' | 'navRoutes' | 'navReports' | 'navAlerts' | 'navLayers' | 'navSettings'
}

const NAV_ITEMS: NavItem[] = [
  { id: 'map',      Icon: MapIcon,       labelKey: 'navMap'      },
  { id: 'routes',   Icon: RouteIcon,     labelKey: 'navRoutes'   },
  { id: 'reports',  Icon: CameraIcon,    labelKey: 'navReports'  },
  { id: 'alerts',   Icon: AlertIcon,     labelKey: 'navAlerts'   },
  { id: 'layers',   Icon: CloudRainIcon, labelKey: 'navLayers'   },
  { id: 'settings', Icon: SettingsIcon,  labelKey: 'navSettings' },
]

interface Props {
  children: ReactNode
  active: NavId
  onSelectNav: (id: NavId) => void
  statsPanel?: ReactNode
  apiOk: boolean | null
}

export function DashboardShell({ children, active, onSelectNav, statsPanel, apiOk }: Props) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex h-full w-full bg-slate-50">
      <div
        className="relative h-full z-20 flex"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <nav className="w-20 h-full bg-[#0c1322] flex flex-col items-center py-4 gap-1.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 mb-3"
            aria-label="Toggle menu"
          >
            <WaveIcon width={24} height={24} strokeWidth={2} />
          </button>

          {NAV_ITEMS.map((item) => {
            const isActive = active === item.id
            const Icon = item.Icon
            return (
              <button
                key={item.id}
                onClick={() => onSelectNav(item.id)}
                aria-label={t[item.labelKey]}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-cyan-400" />
                )}
                <Icon width={22} height={22} />
              </button>
            )
          })}
        </nav>

        <AnimatePresence>
          {expanded && (
            <motion.div
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full bg-[#0c1322] border-r border-slate-800/60 overflow-hidden flex flex-col"
            >
              <div className="px-6 pt-5 pb-4 shrink-0">
                <h1 className="text-white text-2xl font-bold tracking-tight">FloodWatch</h1>
                <p className="text-slate-500 text-[11px] tracking-[0.18em] uppercase mt-1">
                  Flood prediction system for Vietnam
                </p>
              </div>

              <div className="px-3">
                <div className="text-slate-500 text-[10px] tracking-[0.2em] uppercase px-3 pb-2">
                  Navigation
                </div>
                <ul className="flex flex-col gap-1">
                  {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id
                    const Icon = item.Icon
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => onSelectNav(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            isActive
                              ? 'bg-cyan-500/10 text-cyan-100 ring-1 ring-cyan-400/30'
                              : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <Icon width={20} height={20} className={isActive ? 'text-cyan-300' : 'text-slate-400'} />
                          <span className="text-[15px] font-medium">{t[item.labelKey]}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {statsPanel && (
                <div className="px-3 mt-6">
                  <div className="text-slate-500 text-[10px] tracking-[0.2em] uppercase px-3 pb-2">
                    System status
                  </div>
                  {statsPanel}
                </div>
              )}

              <div className="mt-auto px-5 py-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/60">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      apiOk === true ? 'bg-emerald-400' : apiOk === false ? 'bg-rose-400' : 'bg-slate-500'
                    }`}
                  />
                  {apiOk === true ? 'API online' : apiOk === false ? 'API offline' : 'connecting…'}
                </span>
                <LangToggle />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="flex-1 h-full relative">{children}</main>
    </div>
  )
}