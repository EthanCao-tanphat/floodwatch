import { useRef, useState } from 'react'

import { api } from '../api/client'
import { useT } from '../i18n/context'
import type { Strings } from '../i18n/strings'
import type { EvidenceState, Passability, RouteResponse, RiskLevel, RouteSegment } from '../types'

interface Props {
  result: RouteResponse
  onClose: () => void
}

const riskStyle: Record<RiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  moderate: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  severe: 'bg-red-50 text-red-700 ring-red-200',
}

const evidenceStyle: Record<EvidenceState, string> = {
  live: 'bg-sky-50 text-sky-700 ring-sky-200',
  forecast: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  susceptibility: 'bg-amber-50 text-amber-800 ring-amber-200',
  unavailable: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function evidenceState(result: RouteResponse): EvidenceState {
  return result.evidence_state ?? 'forecast'
}

function riskLabel(t: Strings, risk: RiskLevel): string {
  if (risk === 'low') return t.riskLow
  if (risk === 'moderate') return t.riskModerate
  if (risk === 'high') return t.riskHigh
  return t.riskSevere
}

function passabilityText(t: Strings, passability: Passability): string {
  if (passability === 'safe') return t.passabilitySafe
  if (passability === 'slow_pass') return t.passabilitySlowPass
  if (passability === 'avoid_for_motorbikes') return t.passabilityAvoid
  if (passability === 'impassable') return t.passabilityImpassable
  return t.passabilityUnknown
}

function confidenceText(t: Strings, confidence: string): string {
  if (confidence === 'low') return t.confidenceLow
  if (confidence === 'medium') return t.confidenceMedium
  if (confidence === 'high') return t.confidenceHigh
  return confidence
}

function statusLabel(t: Strings, result: RouteResponse): string {
  const state = evidenceState(result)

  if (state === 'unavailable') return t.routeUnknown
  if (state === 'susceptibility') return t.routeHistory

  return riskLabel(t, result.overall_risk)
}

function statusStyle(result: RouteResponse): string {
  const state = evidenceState(result)

  if (state === 'live' || state === 'forecast') {
    return riskStyle[result.overall_risk]
  }

  return evidenceStyle[state]
}

function primaryMetricLabel(t: Strings, state: EvidenceState): string {
  if (state === 'unavailable') return t.liveData
  if (state === 'susceptibility') return t.susceptibility
  return t.modeledRisk
}

function primaryMetricValue(t: Strings, state: EvidenceState, maxRisk: number): string {
  if (state === 'unavailable') return t.liveDataUnavailable
  return `${maxRisk}%`
}

function evidenceNote(t: Strings, state: EvidenceState): string | null {
  if (state === 'unavailable') {
    return t.evidenceUnavailableNote
  }

  if (state === 'susceptibility') {
    return t.evidenceSusceptibilityNote
  }

  if (state === 'live') {
    return t.evidenceLiveNote
  }

  return null
}

function travelModeTitle(t: Strings, result: RouteResponse): string {
  if (result.travel_mode === 'car') return t.travelCar
  if (result.travel_mode === 'walk') return t.travelWalk
  if (result.travel_mode === 'bicycle') return t.travelBicycle
  if (result.travel_mode === 'transit') return t.travelTransit
  return t.travelMotorbike
}

function localizedRecommendation(t: Strings, result: RouteResponse): string {
  const state = evidenceState(result)

  if (state === 'unavailable') return t.routeRecUnavailable
  if (state === 'susceptibility') return t.routeRecSusceptibility
  if (state === 'live') return t.routeRecLive
  if (result.overall_risk === 'severe') return t.routeRecSevere
  if (result.overall_risk === 'high') return t.routeRecHigh
  if (result.overall_risk === 'moderate') return t.routeRecModerate
  return t.routeRecLow
}

function evidenceSummary(t: Strings, segment: RouteSegment): string {
  const evidence = segment.evidence
  const parts: string[] = []

  if (segment.evidence_state === 'unavailable') {
    return t.liveFloodDataUnavailableSegment
  }

  if (segment.evidence_state === 'susceptibility') {
    parts.push(t.historicalSusceptibilityOnly)
  } else {
    parts.push(`${t.rainShort} ${evidence.rainfall_mm.toFixed(1)}mm`)
  }

  if (evidence.tide_level_m !== null && evidence.tide_level_m !== undefined) {
    parts.push(`${t.tideShort} ${evidence.tide_level_m.toFixed(2)}m`)
  }

  if (evidence.river_discharge_ratio !== null && evidence.river_discharge_ratio !== undefined) {
    parts.push(`${t.river} ${evidence.river_discharge_ratio.toFixed(2)}x`)
  }

  if (evidence.report_count > 0) {
    parts.push(`${evidence.report_count} ${evidence.report_count === 1 ? t.riderReport : t.riderReports}`)
  }

  if (segment.evidence_state === 'susceptibility') {
    parts.push(`${t.hotspot} ${Math.round(evidence.hotspot_proximity * 100)}%`)
  }

  return parts.join(' · ')
}

function evidenceTone(segment: RouteSegment): string {
  if (segment.evidence_state === 'unavailable') return 'border-slate-200 bg-slate-50'
  if (segment.evidence_state === 'susceptibility') return 'border-amber-200 bg-amber-50/70'
  if (segment.risk_level === 'high' || segment.risk_level === 'severe') return 'border-orange-200 bg-orange-50/70'
  if (segment.risk_level === 'moderate') return 'border-amber-200 bg-amber-50/60'
  return 'border-emerald-200 bg-emerald-50/60'
}

export function RouteResults({ result, onClose }: Props) {
  const { t } = useT()
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const state = evidenceState(result)
  const recommendation = localizedRecommendation(t, result)
  const segmentScores = result.segments
    .map((segment) => segment.risk_score ?? segment.flood_prob ?? 0)
    .filter((score) => Number.isFinite(score))

  const maxRisk = Math.round(
    (segmentScores.length > 0 ? Math.max(...segmentScores) : 0) * 100
  )

  const riskySegments = result.segments.filter(
    (segment) =>
      segment.risk_level === 'high' ||
      segment.risk_level === 'severe' ||
      segment.passability === 'avoid_for_motorbikes' ||
      segment.passability === 'impassable'
  ).length

  function inspectRoute() {
    if (detailsRef.current) {
      detailsRef.current.open = true
      detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  async function shareRoute() {
    const text = `FloodWatch: ${result.eta_min} ${t.routeEta}, ${result.distance_km} ${t.routeDistance}. ${recommendation}`

    if (navigator.share) {
      await navigator.share({ title: 'FloodWatch route', text })
      return
    }

    await navigator.clipboard?.writeText(text)
  }

  function saveRoute() {
    try {
      const saved = JSON.parse(window.localStorage.getItem('floodwatch_saved_routes_v1') || '[]')
      const next = [
        {
          saved_at: Date.now(),
          eta_min: result.eta_min,
          distance_km: result.distance_km,
          risk: result.overall_risk,
          evidence_state: result.evidence_state,
          recommendation: result.recommendation,
        },
        ...(Array.isArray(saved) ? saved : []),
      ].slice(0, 12)

      window.localStorage.setItem('floodwatch_saved_routes_v1', JSON.stringify(next))
    } catch {
      // Saving is a convenience only; routing should not fail if storage is blocked.
    }
  }

  async function reportWrongPrediction() {
    const userNote = window.prompt(t.feedbackPrompt, '') ?? ''
    const first = result.segments[0]?.start

    setFeedbackState('sending')

    try {
      await api.reportWrongPrediction({
        route_id: result.selected_route_id ?? null,
        lat: first?.lat ?? null,
        lng: first?.lng ?? null,
        evidence_state: result.evidence_state,
        overall_risk: result.overall_risk,
        selected_passability: result.overall_passability,
        user_note: userNote,
      })
      setFeedbackState('sent')
    } catch {
      setFeedbackState('error')
    }
  }

  return (
    <div className="bg-white text-slate-900 sm:mt-3 sm:rounded-xl sm:shadow-[0_14px_36px_rgba(15,23,42,0.16)] sm:ring-1 sm:ring-slate-200">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-4">
        <div>
          <div className="hidden text-xs font-extrabold uppercase tracking-wide text-slate-400 sm:block">
            {t.selectedRoute}
          </div>

          <div className="text-3xl font-black tracking-tight text-slate-950 sm:hidden">
            {travelModeTitle(t, result)}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-extrabold text-slate-950">
              {result.eta_min} {t.routeEta}
            </span>

            <span className="text-sm font-semibold text-slate-500">
              {result.distance_km} {t.routeDistance}
            </span>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyle(result)}`}
            >
              {statusLabel(t, result)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close route results"
        >
          ×
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto border-b border-slate-100 px-4 py-3 sm:hidden">
        <button
          type="button"
          onClick={inspectRoute}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-cyan-700 px-5 text-sm font-extrabold text-white shadow-lg shadow-cyan-700/20"
        >
          <ArrowIcon className="h-5 w-5" />
          {t.startAction}
        </button>

        <button
          type="button"
          onClick={() => void shareRoute()}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-cyan-50 px-5 text-sm font-extrabold text-cyan-800 ring-1 ring-cyan-100"
        >
          <ShareIcon className="h-5 w-5" />
          {t.share}
        </button>

        <button
          type="button"
          onClick={saveRoute}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-slate-50 px-5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-100"
        >
          <BookmarkIcon className="h-5 w-5" />
          {t.save}
        </button>
      </div>

      <div className="space-y-3 px-4 py-4 sm:hidden">
        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950 ring-1 ring-sky-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-sky-700/70">
                {t.floodEvidence}
              </div>
              <div className="mt-1 font-bold">{recommendation}</div>
            </div>

            <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100">
              {primaryMetricValue(t, state, maxRisk)}
            </div>
          </div>

          {evidenceNote(t, state) && (
            <div className="mt-2 text-xs font-semibold text-sky-800/80">
              {evidenceNote(t, state)}
            </div>
          )}

          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-sky-900 ring-1 ring-sky-100">
            <div className="font-black uppercase tracking-wide text-sky-700/70">
              {t.evidenceSummary}
            </div>
            <div className="mt-1">{result.evidence_summary || recommendation}</div>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-100">
          <div className="font-black">{t.pilotDisclaimer}</div>
          <button
            type="button"
            onClick={() => void reportWrongPrediction()}
            disabled={feedbackState === 'sending' || feedbackState === 'sent'}
            className="mt-2 rounded-full bg-white px-3 py-2 text-xs font-black text-amber-800 ring-1 ring-amber-200 disabled:opacity-60"
          >
            {feedbackState === 'sent'
              ? t.feedbackSaved
              : feedbackState === 'error'
              ? t.feedbackFailed
              : t.reportWrongPrediction}
          </button>
        </div>

        <details ref={detailsRef} className="rounded-2xl bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-slate-800">
            {t.routeDetails}
          </summary>

          <div className="space-y-3 border-t border-slate-100 px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label={primaryMetricLabel(t, state)} value={primaryMetricValue(t, state, maxRisk)} />
              <MetricCard label={t.riskySegments} value={String(riskySegments)} />
              <MetricCard label={t.confidence} value={confidenceText(t, result.confidence)} />
            </div>

            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {t.routeStatus}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs font-bold text-slate-400">{t.passability}</div>
                  <div className="mt-1 font-extrabold text-slate-900">
                    {passabilityText(t, result.overall_passability)}
                  </div>
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs font-bold text-slate-400">{t.segments}</div>
                  <div className="mt-1 font-extrabold text-slate-900">
                    {result.segments.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-base font-extrabold text-slate-950">{t.floodDetails}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {t.floodDetailsSubtitle}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {result.segments.map((segment, index) => {
              const score = Math.round(
                ((segment.risk_score ?? segment.flood_prob ?? 0) as number) * 100
              )

              return (
                <div
                  key={`${segment.start.lat}-${segment.start.lng}-${index}-mobile`}
                  className="grid grid-cols-[2.5rem_1fr] gap-3 px-4 py-4"
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                      {index + 1}
                    </div>
                    {index < result.segments.length - 1 && (
                      <div className="mt-2 h-full min-h-8 w-0.5 rounded-full bg-slate-200" />
                    )}
                  </div>

                  <div className={`rounded-xl border px-3 py-3 ${evidenceTone(segment)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-extrabold text-slate-950">
                          {t.segmentLabel} {index + 1}
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                          {evidenceSummary(t, segment)}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-800 ring-1 ring-slate-200">
                        {score}%
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                        {passabilityText(t, segment.passability)}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                        {confidenceText(t, segment.confidence)} {t.confidence.toLowerCase()}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                        {segment.evidence_state}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="hidden space-y-3 px-4 py-4 sm:block">
        <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950 ring-1 ring-sky-100">
          <div className="font-extrabold">{t.recommendation}</div>
          <div className="mt-1">{recommendation}</div>
          {evidenceNote(t, state) && (
            <div className="mt-2 text-xs font-semibold text-sky-800/80">
              {evidenceNote(t, state)}
            </div>
          )}
          <div className="mt-2 text-xs font-semibold text-sky-900">
            {result.evidence_summary || recommendation}
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 ring-1 ring-amber-100">
          <div className="font-black">{t.pilotDisclaimer}</div>
          <button
            type="button"
            onClick={() => void reportWrongPrediction()}
            disabled={feedbackState === 'sending' || feedbackState === 'sent'}
            className="mt-2 rounded-full bg-white px-3 py-2 text-xs font-black text-amber-800 ring-1 ring-amber-200 disabled:opacity-60"
          >
            {feedbackState === 'sent'
              ? t.feedbackSaved
              : feedbackState === 'error'
              ? t.feedbackFailed
              : t.reportWrongPrediction}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MetricCard label={primaryMetricLabel(t, state)} value={primaryMetricValue(t, state, maxRisk)} />
          <MetricCard label={t.riskySegments} value={String(riskySegments)} />
          <MetricCard label={t.confidence} value={confidenceText(t, result.confidence)} />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {t.routeStatus}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
              <div className="text-xs font-bold text-slate-400">{t.passability}</div>
              <div className="mt-1 font-extrabold text-slate-900">
                {passabilityText(t, result.overall_passability)}
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
              <div className="text-xs font-bold text-slate-400">{t.segments}</div>
              <div className="mt-1 font-extrabold text-slate-900">
                {result.segments.length}
              </div>
            </div>
          </div>
        </div>

        <details className="rounded-lg bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-slate-800">
            {t.segmentEvidence}
          </summary>

          <div className="max-h-72 overflow-y-auto border-t border-slate-100">
            {result.segments.map((segment, index) => {
              const score = Math.round(
                ((segment.risk_score ?? segment.flood_prob ?? 0) as number) * 100
              )

              return (
                <div
                  key={`${segment.start.lat}-${segment.start.lng}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900">
                      {t.segmentLabel} {index + 1}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-500">
                      {t.rainShort} {segment.evidence.rainfall_mm.toFixed(1)}mm · {t.tideShort}{' '}
                      {segment.evidence.tide_level_m?.toFixed(2) ?? 'n/a'}m · {t.river}{' '}
                      {segment.evidence.river_discharge_ratio?.toFixed(2) ?? 'n/a'}x · {t.reportsShort}{' '}
                      {segment.evidence.report_count}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-slate-900">
                      {score}%
                    </div>

                    <div className="text-xs font-semibold text-slate-500">
                      {passabilityText(t, segment.passability)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      </div>
    </div>
  )
}

function ArrowIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 19V5" strokeLinecap="round" />
      <path d="m5 12 7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4" strokeLinecap="round" />
      <path d="m8.6 13.5 6.8 4" strokeLinecap="round" />
    </svg>
  )
}

function BookmarkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 4h12v17l-6-3-6 3V4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-1 truncate text-lg font-extrabold text-slate-950">{value}</div>
    </div>
  )
}
