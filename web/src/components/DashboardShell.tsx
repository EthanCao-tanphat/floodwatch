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

const TOP_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'settings')

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
  const [drawerOpen, setDrawerOpen] = useState(false)

  const apiStatus =
    apiOk === true ? 'API online' : apiOk === false ? 'API offline' : 'Connecting'

  const apiDot =
    apiOk === true
      ? 'bg-emerald-500'
      : apiOk === false
        ? 'bg-red-500'
        : 'bg-amber-400'

  function selectFromDrawer(id: NavId) {
    onSelectNav(id)
    setDrawerOpen(false)
  }

  return (
    <div className="app-screen relative bg-slate-950">
      {children}

      {/* Google Maps-style top control row */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 px-3 pb-2 safe-top sm:px-4 sm:pb-4">
        <div className="pointer-events-auto flex max-w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-auto sm:pb-2 sm:pr-4">
          <div className="flex h-[58px] w-full shrink-0 items-center gap-2 rounded-[22px] bg-white px-2 py-1 shadow-[0_12px_32px_rgba(15,23,42,0.22)] ring-1 ring-slate-200 sm:h-[52px] sm:w-[min(480px,calc(100vw-28px))] sm:rounded-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <MenuIcon className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => onSelectNav('routes')}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-2 py-2 text-left hover:bg-slate-50"
            >
              <SearchIcon className="h-5 w-5 shrink-0 text-slate-500" />

              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-slate-800 sm:text-base">
                  Search places or routes
                </div>

                <div className="truncate text-xs font-medium text-slate-500">
                  Address, map pin, or coordinates
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelectNav('routes')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm hover:bg-cyan-500"
              aria-label="Directions"
            >
              <RouteIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="hidden max-w-full items-center gap-2 overflow-x-auto pb-1 pr-2 sm:contents">
            {TOP_NAV_ITEMS.map((item) => (
              <ToolbarChip
                key={item.id}
                item={item}
                label={t[item.labelKey]}
                active={active === item.id}
                onClick={() => onSelectNav(item.id)}
              />
            ))}

            <div className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.16)] ring-1 ring-slate-200">
              <span className={`h-2.5 w-2.5 rounded-full ${apiDot}`} />
              {apiStatus}
            </div>
          </div>
        </div>
      </div>

      {/* Side drawer from hamburger menu only */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />

            <motion.aside
              className="fixed bottom-3 left-3 top-3 z-50 flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl bg-white text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.38)] ring-1 ring-slate-200"
              initial={{ x: -32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -32, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/20">
                    <WaveIcon className="h-7 w-7" />
                  </div>

                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">
                      FloodWatch
                    </h1>

                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                      Flood routing for Vietnam
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close menu"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-1">
                  {NAV_ITEMS.map((item) => (
                    <DrawerButton
                      key={item.id}
                      item={item}
                      label={t[item.labelKey]}
                      active={active === item.id}
                      onClick={() => selectFromDrawer(item.id)}
                    />
                  ))}
                </div>

                {statsPanel && (
                  <div className="mt-6">
                    <div className="mb-3 px-1 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
                      System status
                    </div>

                    <div className="rounded-2xl bg-slate-950 p-3 text-white">
                      {statsPanel}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${apiDot}`} />
                    {apiStatus}
                  </div>

                  <LangToggle />
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolbarChip({
  item,
  label,
  active,
  onClick,
}: {
  item: NavItem
  label: string
  active: boolean
  onClick: () => void
}) {
  const Icon = item.Icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-[0_10px_30px_rgba(15,23,42,0.16)] ring-1 transition ${
        active
          ? 'bg-cyan-600 text-white ring-cyan-500'
          : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}

function DrawerButton({
  item,
  label,
  active,
  onClick,
}: {
  item: NavItem
  label: string
  active: boolean
  onClick: () => void
}) {
  const Icon = item.Icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
        active
          ? 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          active ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <span className="text-sm font-bold">{label}</span>
    </button>
  )
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M4 12h16" strokeLinecap="round" />
      <path d="M4 17h16" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 6l12 12" strokeLinecap="round" />
      <path d="M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}
