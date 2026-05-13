/**
 * StatsPanel — system-status rows.
 * All props optional with safe defaults. No i18n keys (uses literal strings).
 * Drop at:  web/src/components/StatsPanel.tsx
 */
import type { ReactNode } from 'react'
import {
  BarChartIcon,
  PinIcon,
  CloudRainIcon,
  WaveIcon,
  GlobeIcon,
} from './icons'

interface Props {
  activeReports?: number
  floodHotspots?: number
  rainNowMm?: number
  tideLevelM?: number
  coveragePct?: number
}

export function StatsPanel({
  activeReports = 0,
  floodHotspots = 0,
  rainNowMm = 0,
  tideLevelM = 0,
  coveragePct = 100,
}: Props) {
  const num = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const reports  = num(activeReports)
  const hotspots = num(floodHotspots)
  const rain     = num(rainNowMm)
  const tide     = num(tideLevelM)
  const coverage = num(coveragePct, 100)

  return (
    <ul className="flex flex-col gap-2">
      <Row
        icon={<BarChartIcon className="text-cyan-300" />}
        label="Active reports"
        value={<span className="text-cyan-300 font-semibold">{reports}</span>}
      />
      <Row
        icon={<PinIcon className="text-amber-300" />}
        label="Flood hotspots"
        value={<span className="text-amber-300 font-semibold">{hotspots}</span>}
      />
      <Row
        icon={<CloudRainIcon className="text-emerald-300" />}
        label="Rain now"
        value={
          <span className="text-emerald-300 font-semibold">
            {rain.toFixed(1)}<span className="text-emerald-500/70 text-xs ml-0.5">mm</span>
          </span>
        }
      />
      <Row
        icon={<WaveIcon className="text-sky-300" />}
        label="Tide level"
        value={
          <span className="text-sky-300 font-semibold">
            {tide.toFixed(2)}<span className="text-sky-500/70 text-xs ml-0.5">m</span>
          </span>
        }
      />
      <Row
        icon={<GlobeIcon className="text-emerald-300" />}
        label="Coverage"
        value={
          <span className="text-emerald-300 font-semibold">
            {Math.round(coverage)}<span className="text-emerald-500/70 text-xs ml-0.5">%</span>
          </span>
        }
      />
    </ul>
  )
}

function Row({
  icon, label, value,
}: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.025] ring-1 ring-white/5">
      <span className="flex items-center gap-2.5 text-slate-300 text-sm">
        <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
        {label}
      </span>
      {value}
    </li>
  )
}