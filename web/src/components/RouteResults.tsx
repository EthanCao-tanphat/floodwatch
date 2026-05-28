import type { EvidenceState, Passability, RouteResponse, RiskLevel } from '../types'

interface Props {
  result: RouteResponse
  onClose: () => void
}

const riskCopy: Record<RiskLevel, string> = {
  low: 'Safe',
  moderate: 'Caution',
  high: 'Avoid',
  severe: 'Delay',
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

const passabilityLabel: Record<Passability, string> = {
  safe: 'Passable',
  slow_pass: 'Pass slowly',
  avoid_for_motorbikes: 'Avoid for motorbikes',
  impassable: 'Impassable',
  unknown: 'Unknown',
}

function evidenceState(result: RouteResponse): EvidenceState {
  return result.evidence_state ?? 'forecast'
}

function statusLabel(result: RouteResponse): string {
  const state = evidenceState(result)

  if (state === 'unavailable') return 'Unknown'
  if (state === 'susceptibility') return 'History'

  return riskCopy[result.overall_risk]
}

function statusStyle(result: RouteResponse): string {
  const state = evidenceState(result)

  if (state === 'live' || state === 'forecast') {
    return riskStyle[result.overall_risk]
  }

  return evidenceStyle[state]
}

function primaryMetricLabel(state: EvidenceState): string {
  if (state === 'unavailable') return 'Live data'
  if (state === 'susceptibility') return 'Susceptibility'
  return 'Modeled risk'
}

function primaryMetricValue(state: EvidenceState, maxRisk: number): string {
  if (state === 'unavailable') return 'Unavailable'
  return `${maxRisk}%`
}

function evidenceNote(state: EvidenceState): string | null {
  if (state === 'unavailable') {
    return 'Live flood data is unavailable, so this result avoids active-flood claims.'
  }

  if (state === 'susceptibility') {
    return 'This is historical susceptibility, not a detected flood.'
  }

  if (state === 'live') {
    return 'Includes recent rider report evidence.'
  }

  return null
}

function travelModeTitle(result: RouteResponse): string {
  if (result.travel_mode === 'car') return 'Car'
  if (result.travel_mode === 'walk') return 'Walk'
  if (result.travel_mode === 'bicycle') return 'Bicycle'
  if (result.travel_mode === 'transit') return 'Transit'
  return 'Two-wheeler'
}

export function RouteResults({ result, onClose }: Props) {
  const state = evidenceState(result)
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

  function openGoogleMaps() {
    const first = result.segments[0]?.start
    const last = result.segments[result.segments.length - 1]?.end

    if (!first || !last) return

    const url = new URL('https://www.google.com/maps/dir/')
    url.pathname = `/maps/dir/${first.lat},${first.lng}/${last.lat},${last.lng}`
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  async function shareRoute() {
    const text = `FloodWatch route: ${result.eta_min} min, ${result.distance_km} km. ${result.recommendation}`

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

  return (
    <div className="mt-3 overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 sm:rounded-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
        <div>
          <div className="hidden text-xs font-extrabold uppercase tracking-wide text-slate-400 sm:block">
            Selected route
          </div>

          <div className="text-3xl font-black tracking-tight text-slate-950 sm:hidden">
            {travelModeTitle(result)}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-extrabold text-slate-950">
              {result.eta_min} min
            </span>

            <span className="text-sm font-semibold text-slate-500">
              {result.distance_km} km
            </span>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyle(result)}`}
            >
              {statusLabel(result)}
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
          onClick={openGoogleMaps}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-cyan-700 px-5 text-sm font-extrabold text-white shadow-lg shadow-cyan-700/20"
        >
          <ArrowIcon className="h-5 w-5" />
          Start
        </button>

        <button
          type="button"
          onClick={() => void shareRoute()}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-cyan-50 px-5 text-sm font-extrabold text-cyan-800 ring-1 ring-cyan-100"
        >
          <ShareIcon className="h-5 w-5" />
          Share
        </button>

        <button
          type="button"
          onClick={saveRoute}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-slate-50 px-5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-100"
        >
          <BookmarkIcon className="h-5 w-5" />
          Save
        </button>
      </div>

      <div className="space-y-3 px-4 py-4 sm:hidden">
        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950 ring-1 ring-sky-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-sky-700/70">
                Flood evidence
              </div>
              <div className="mt-1 font-bold">{result.recommendation}</div>
            </div>

            <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100">
              {primaryMetricValue(state, maxRisk)}
            </div>
          </div>

          {evidenceNote(state) && (
            <div className="mt-2 text-xs font-semibold text-sky-800/80">
              {evidenceNote(state)}
            </div>
          )}
        </div>

        <details className="rounded-2xl bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-slate-800">
            Route details
          </summary>

          <div className="space-y-3 border-t border-slate-100 px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label={primaryMetricLabel(state)} value={primaryMetricValue(state, maxRisk)} />
              <MetricCard label="Risky seg." value={String(riskySegments)} />
              <MetricCard label="Confidence" value={result.confidence} />
            </div>

            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                Route status
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs font-bold text-slate-400">Passability</div>
                  <div className="mt-1 font-extrabold text-slate-900">
                    {passabilityLabel[result.overall_passability]}
                  </div>
                </div>

                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs font-bold text-slate-400">Segments</div>
                  <div className="mt-1 font-extrabold text-slate-900">
                    {result.segments.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="hidden space-y-3 px-4 py-4 sm:block">
        <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950 ring-1 ring-sky-100">
          <div className="font-extrabold">Recommendation</div>
          <div className="mt-1">{result.recommendation}</div>
          {evidenceNote(state) && (
            <div className="mt-2 text-xs font-semibold text-sky-800/80">
              {evidenceNote(state)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MetricCard label={primaryMetricLabel(state)} value={primaryMetricValue(state, maxRisk)} />
          <MetricCard label="Risky seg." value={String(riskySegments)} />
          <MetricCard label="Confidence" value={result.confidence} />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Route status
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
              <div className="text-xs font-bold text-slate-400">Passability</div>
              <div className="mt-1 font-extrabold text-slate-900">
                {passabilityLabel[result.overall_passability]}
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
              <div className="text-xs font-bold text-slate-400">Segments</div>
              <div className="mt-1 font-extrabold text-slate-900">
                {result.segments.length}
              </div>
            </div>
          </div>
        </div>

        <details className="rounded-lg bg-white ring-1 ring-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-slate-800">
            Segment evidence
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
                      Segment {index + 1}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-500">
                      Rain {segment.evidence.rainfall_mm.toFixed(1)}mm · Tide{' '}
                      {segment.evidence.tide_level_m?.toFixed(2) ?? 'n/a'}m · River{' '}
                      {segment.evidence.river_discharge_ratio?.toFixed(2) ?? 'n/a'}x · Reports{' '}
                      {segment.evidence.report_count}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-slate-900">
                      {score}%
                    </div>

                    <div className="text-xs font-semibold text-slate-500">
                      {passabilityLabel[segment.passability]}
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
