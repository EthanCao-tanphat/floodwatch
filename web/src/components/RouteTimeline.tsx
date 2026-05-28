import type { RouteTimelinePoint } from '../types'
import { RiskBadge } from './RiskBadge'

interface Props {
  timeline?: RouteTimelinePoint[]
}

function timeLabel(minutes: number): string {
  if (minutes === 0) return 'Now'
  return `+${minutes}m`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function pointValue(point: RouteTimelinePoint): string {
  if (point.evidence_state === 'unavailable') return 'No data'
  return percent(point.flood_prob_max)
}

function pointLabel(point: RouteTimelinePoint): string {
  if (point.evidence_state === 'susceptibility') return 'susceptibility'
  if (point.evidence_state === 'unavailable') return 'unavailable'
  return point.risk_level
}

export function RouteTimeline({ timeline }: Props) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Future route timeline is not available for this route yet.
      </div>
    )
  }

  const peak = [...timeline].sort(
    (a, b) =>
      b.flood_prob_max - a.flood_prob_max ||
      b.severe_segments - a.severe_segments ||
      b.high_risk_segments - a.high_risk_segments
  )[0]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
            Route risk timeline
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Peak: {pointLabel(peak)} at {timeLabel(peak.minutes_ahead)} ·{' '}
            {pointValue(peak)}
          </div>
        </div>

        <RiskBadge level={peak.risk_level} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {timeline.map((point) => (
          <div
            key={point.minutes_ahead}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2"
          >
            <div className="text-[11px] font-black uppercase text-slate-500">
              {timeLabel(point.minutes_ahead)}
            </div>

            <div className="mt-1 text-lg font-black text-slate-900">
              {pointValue(point)}
            </div>

            <div className="mt-1">
              <RiskBadge level={point.risk_level} />
            </div>

            <div className="mt-2 text-[11px] leading-snug text-slate-500">
              {point.high_risk_segments} risky seg · rain{' '}
              {point.rainfall_mm_max.toFixed(1)}mm
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-cyan-50 p-3 text-xs leading-relaxed text-cyan-900">
        <div className="font-black">Main signal: {peak.dominant_signal}</div>
        <div className="mt-1">{peak.recommendation}</div>
      </div>
    </div>
  )
}
