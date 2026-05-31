import { useT } from '../i18n/context'
import type { Strings } from '../i18n/strings'
import type { CoverageInfo, EvidenceState, RiskLevel, RouteCandidate } from '../types'

interface Props {
  routes: RouteCandidate[]
  selectedRouteId: string | null
  recommendedRouteId?: string | null
  coverage?: CoverageInfo | null
  onSelectRoute: (id: string) => void
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

function riskLabel(t: Strings, risk: RiskLevel): string {
  if (risk === 'low') return t.riskLow
  if (risk === 'moderate') return t.riskModerate
  if (risk === 'high') return t.riskHigh
  return t.riskSevere
}

function routeStatusCopy(t: Strings, route: RouteCandidate): string {
  const state = evidenceState(route)

  if (state === 'unavailable') return t.routeUnknown
  if (state === 'susceptibility') return t.routeHistory

  return riskLabel(t, route.overall_risk)
}

function routeStatusRing(route: RouteCandidate): string {
  const state = evidenceState(route)

  if (state === 'live' || state === 'forecast') {
    return riskRing[route.overall_risk]
  }

  return evidenceRing[state]
}

function routeMetricLabel(t: Strings, state: EvidenceState): string {
  if (state === 'unavailable') return t.liveDataUnavailable
  if (state === 'susceptibility') return t.susceptibility
  return t.modeledRisk
}

function confidenceText(t: Strings, confidence: string): string {
  if (confidence === 'low') return t.confidenceLow
  if (confidence === 'medium') return t.confidenceMedium
  if (confidence === 'high') return t.confidenceHigh
  return confidence
}

function localizedRouteDescription(t: Strings, route: RouteCandidate): string {
  const state = evidenceState(route)

  if (state === 'unavailable') {
    return t.routeRecUnavailable
  }

  if (state === 'susceptibility') {
    return t.routeRecSusceptibility
  }

  if (state === 'live') return t.routeRecLive

  if (route.overall_risk === 'severe') {
    return t.routeRecSevere
  }

  if (route.overall_risk === 'high') {
    return t.routeRecHigh
  }

  if (route.overall_risk === 'moderate') {
    return t.routeRecModerate
  }

  return t.routeRecLow
}

function routeLabel(t: Strings, label: string, lang: string): string {
  if (label === 'Fastest') return t.fastest
  if (label === 'Safest') return t.riskLow
  if (lang === 'vi' && label.startsWith('Alternative')) return label.replace('Alternative', 'Tuyến khác')
  return label
}

export function RouteChoices({
  routes,
  selectedRouteId,
  recommendedRouteId,
  coverage,
  onSelectRoute,
}: Props) {
  const { t, lang } = useT()

  if (!routes.length) return null

  return (
    <div className="hidden overflow-hidden rounded-xl bg-white text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.18)] ring-1 ring-slate-200 sm:block">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold tracking-tight text-slate-950">
              {t.routeOptionsTitle}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {t.routeOptionsSubtitle}
            </div>
          </div>
        </div>

        {coverage && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {t.coverage}: <span className="font-bold">{coverage.label}</span> · {coverage.city}
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
                        {routeLabel(t, route.label, lang)}
                      </span>

                      {recommended && (
                        <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-700 ring-1 ring-cyan-100">
                          {t.recommended}
                        </span>
                      )}

                      {route.is_fastest && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
                          {t.fastest}
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
                        {route.eta_min} {t.routeEta}
                      </span>
                      {' · '}
                      {route.distance_km} {t.routeDistance}
                    </div>
                  </div>

                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${routeStatusRing(route)}`}
                  >
                    {routeStatusCopy(t, route)}
                  </div>
                </div>

                <div className="mt-2 text-sm font-semibold text-sky-700">
                  {routeMetricLabel(t, state)}{' '}
                  {state === 'unavailable' ? '' : `${floodPct}% · `}
                  {confidenceText(t, route.confidence)} {t.confidence.toLowerCase()}
                </div>

                <div className="mt-1 text-[13px] leading-relaxed text-slate-600">
                  {lang === 'en' && route.tradeoff_summary ? route.tradeoff_summary : localizedRouteDescription(t, route)}
                </div>

                {selected && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
                      {t.selectedRoute}
                    </span>

                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                      {t.tapLineForSegmentDetail}
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
