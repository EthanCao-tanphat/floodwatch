import type { CoverageInfo, RiskLevel, RouteCandidate } from '../types'
import { RiskBadge } from './RiskBadge'

interface Props {
  routes: RouteCandidate[]
  selectedRouteId: string | null
  recommendedRouteId?: string | null
  coverage?: CoverageInfo | null
  onSelectRoute: (id: string) => void
}

const coverageStyle: Record<number, string> = {
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-amber-50 text-amber-800 border-amber-200',
  3: 'bg-slate-50 text-slate-700 border-slate-200',
}

const riskCopy: Record<RiskLevel, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  severe: 'Severe risk',
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
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-3 text-slate-900">
      {coverage && (
        <div
          className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
            coverageStyle[coverage.tier] ?? coverageStyle[3]
          }`}
        >
          <div className="font-black">
            Coverage: {coverage.label} · {coverage.city}
          </div>
          <div className="mt-1 opacity-80">{coverage.confidence_note}</div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black">Route options</h3>
        <span className="text-xs text-slate-500">
          Click a route like Google Maps
        </span>
      </div>

      <div className="space-y-2">
        {routes.map((route) => {
          const selected = route.id === selectedRouteId
          const recommended = route.id === recommendedRouteId

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelectRoute(route.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                selected
                  ? 'border-cyan-400 bg-cyan-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black">{route.label}</span>
                    {recommended && (
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-700">
                        Recommended
                      </span>
                    )}
                    {route.is_fastest && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
                        Fastest
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {route.distance_km} km · ~{route.eta_min} min ·{' '}
                    {riskCopy[route.overall_risk]}
                  </div>
                </div>

                <RiskBadge level={route.overall_risk} />
              </div>

              <div className="mt-2 text-xs leading-relaxed text-slate-600">
                {route.tradeoff_summary || route.recommendation}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
