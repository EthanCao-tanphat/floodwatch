import type { CoverageInfo, EvidenceState, RiskLevel, RouteCandidate } from '../types'

interface Props {
  routes: RouteCandidate[]
  selectedRouteId: string | null
  recommendedRouteId?: string | null
  coverage?: CoverageInfo | null
  onSelectRoute: (id: string) => void
}

const riskCopy: Record<RiskLevel, string> = {
  low: 'Safe',
  moderate: 'Caution',
  high: 'Avoid',
  severe: 'Delay',
}

const riskBorder: Record<RiskLevel, string> = {
  low: 'border-emerald-500',
  moderate: 'border-amber-500',
  high: 'border-orange-500',
  severe: 'border-red-500',
}

const riskRing: Record<RiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  moderate: 'bg-amber-50 text-amber-800 ring-amber-200',
  high: 'bg-orange-50 text-orange-800 ring-orange-200',
  severe: 'bg-red-50 text-red-800 ring-red-200',
}

const evidenceRing: Record<EvidenceState, string> = {
  live: 'bg-sky-50 text-sky-700 ring-sky-200',
  forecast: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  susceptibility: 'bg-amber-50 text-amber-800 ring-amber-200',
  unavailable: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function evidenceState(route: RouteCandidate): EvidenceState {
  return route.evidence_state ?? 'forecast'
}

function routeStatusCopy(route: RouteCandidate): string {
  const state = evidenceState(route)

  if (state === 'unavailable') return 'Unknown'
  if (state === 'susceptibility') return 'History'

  return riskCopy[route.overall_risk]
}

function routeStatusRing(route: RouteCandidate): string {
  const state = evidenceState(route)

  if (state === 'live' || state === 'forecast') {
    return riskRing[route.overall_risk]
  }

  return evidenceRing[state]
}

function routeMetricLabel(state: EvidenceState): string {
  if (state === 'unavailable') return 'Live data unavailable'
  if (state === 'susceptibility') return 'Historical susceptibility'
  return 'Modeled flood risk'
}

function riskDescription(route: RouteCandidate): string {
  const pct = Math.round((route.flood_prob_max ?? 0) * 100)
  const state = evidenceState(route)

  if (state === 'unavailable') {
    return 'Live flood forecast is unavailable; check rider reports before riding.'
  }

  if (state === 'susceptibility') {
    return 'Historical hotspot/drainage signal only; no active flood signal.'
  }

  if (route.overall_risk === 'severe') {
    return `Forecast risk may reach ${pct}%. Strongly consider delaying this trip.`
  }

  if (route.overall_risk === 'high') {
    return `Forecast risk may reach ${pct}%. Some segments may stall motorbikes.`
  }

  if (route.overall_risk === 'moderate') {
    return `Forecast risk may reach ${pct}%. Pass slowly near highlighted segments.`
  }

  return `No active flood signal. Modeled risk around ${pct}%.`
}

export function RouteChoices({
  routes,
  selectedRouteId,
  recommendedRouteId,
  coverage,
  onSelectRoute,
}: Props) {
  if (!routes.length) return null

  return (
    <div className="hidden overflow-hidden rounded-xl bg-white text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.18)] ring-1 ring-slate-200 sm:block">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold tracking-tight text-slate-950">
              Routes
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Route options with current flood evidence.
            </div>
          </div>
        </div>

        {coverage && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Coverage: <span className="font-bold">{coverage.label}</span> · {coverage.city}
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {routes.map((route) => {
          const selected = route.id === selectedRouteId
          const recommended = route.id === recommendedRouteId
          const floodPct = Math.round((route.flood_prob_max ?? 0) * 100)
          const state = evidenceState(route)

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelectRoute(route.id)}
              className={`group flex w-full gap-3 border-l-4 px-4 py-3 text-left transition ${
                riskBorder[route.overall_risk]
              } ${
                selected ? 'bg-cyan-50/70' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-extrabold text-slate-950">
                        {route.label}
                      </span>

                      {recommended && (
                        <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-700 ring-1 ring-cyan-100">
                          Recommended
                        </span>
                      )}

                      {route.is_fastest && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
                          Fastest
                        </span>
                      )}
                    </div>

                    {route.street_summary && (
                      <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                        {route.street_summary}
                      </div>
                    )}

                    <div className="mt-1 text-[13px] text-slate-600">
                      <span className="font-extrabold text-slate-950">
                        {route.eta_min} min
                      </span>
                      {' · '}
                      {route.distance_km} km
                    </div>
                  </div>

                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${routeStatusRing(route)}`}
                  >
                    {routeStatusCopy(route)}
                  </div>
                </div>

                <div className="mt-2 text-sm font-semibold text-sky-700">
                  {routeMetricLabel(state)}{' '}
                  {state === 'unavailable' ? '' : `${floodPct}% · `}
                  {route.confidence} confidence
                </div>

                <div className="mt-1 text-[13px] leading-relaxed text-slate-600">
                  {route.tradeoff_summary || riskDescription(route)}
                </div>

                {selected && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
                      Selected route
                    </span>

                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                      Tap line for segment detail
                    </span>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
