import type { Passability, RouteResponse, StatusResponse } from '../types'
import { RiskBadge } from './RiskBadge'
import { useT } from '../i18n/context'

interface Props {
  result: RouteResponse | null
  status: StatusResponse | null
  onClose: () => void
}

export function AlertsPanel({ result, status, onClose }: Props) {
  const { t } = useT()

  const passabilityLabel: Record<Passability, string> = {
    safe: t.passabilitySafe,
    slow_pass: t.passabilitySlowPass,
    avoid_for_motorbikes: t.passabilityAvoid,
    impassable: t.passabilityImpassable,
    unknown: t.passabilityUnknown,
  }

  const alerts =
    result?.segments
      .map((seg, index) => ({ seg, index }))
      .filter(
        ({ seg }) =>
          seg.risk_score >= 0.25 ||
          seg.passability !== 'safe' ||
          seg.risk_level !== 'low'
      ) ?? []

  return (
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-4 text-slate-900 max-h-[78vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">Flood alerts</h2>
          <p className="text-xs text-slate-500">
            30–60 minute motorbike passability warnings
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
          aria-label="Close alerts"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Rain now</p>
          <p className="font-bold text-slate-900">
            {(status?.rain_now_mm ?? 0).toFixed(1)} mm
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Tide</p>
          <p className="font-bold text-slate-900">
            {(status?.tide_level_m ?? 0).toFixed(2)} m
          </p>
        </div>
      </div>

      {!result && (
        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 text-sm text-cyan-900">
          Run a route check first. FloodWatch will convert risky route segments into
          rider alerts here.
        </div>
      )}

      {result && alerts.length === 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900">
          No high-risk segment on the current route. Continue monitoring rain and tide.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(({ seg, index }) => (
            <div
              key={`${index}-${seg.start.lat}-${seg.start.lng}`}
              className="rounded-xl bg-slate-50 border border-slate-100 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Segment {index + 1}</div>
                <RiskBadge level={seg.risk_level} />
              </div>

              <div className="mt-1 text-sm text-slate-700">
                {passabilityLabel[seg.passability]} · {(seg.risk_score * 100).toFixed(0)}%
                risk
              </div>

              <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                Rain {seg.evidence.rainfall_mm.toFixed(1)}mm · Tide{' '}
                {seg.evidence.tide_level_m?.toFixed(2) ?? 'n/a'}m · Hotspot{' '}
                {(seg.evidence.hotspot_proximity * 100).toFixed(0)}% · Drainage{' '}
                {seg.evidence.drainage_score !== null
                  ? `${(seg.evidence.drainage_score * 100).toFixed(0)}%`
                  : 'n/a'} · River{' '}
                {seg.evidence.river_discharge_ratio?.toFixed(2) ?? 'n/a'}x
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.recommendation && (
        <div className="mt-3 rounded-xl bg-slate-900 text-white p-3 text-sm">
          {result.recommendation}
        </div>
      )}
    </div>
  )
}
