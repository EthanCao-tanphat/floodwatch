import type { RouteResponse, RiskLevel } from '../types'
import { RiskBadge } from './RiskBadge'
import { useT } from '../i18n/context'

interface Props {
  result: RouteResponse
  onClose: () => void
}

export function RouteResults({ result, onClose }: Props) {
  const { t } = useT()

  // Pick recommendation in current language based on overall risk
  const recMap: Record<RiskLevel, string> = {
    severe: t.recSevere,
    high: t.recHigh,
    moderate: t.recModerate,
    low: t.recLow,
  }
  const localRec = recMap[result.overall_risk]

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 space-y-3 max-h-[60vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t.resultsTitle}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <RiskBadge level={result.overall_risk} />
            <span className="text-sm text-slate-600">
              {result.distance_km} {t.routeDistance} · ~{result.eta_min} {t.routeEta}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700">
        💡 {localRec}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {t.segmentDetails}
        </div>
        <div className="space-y-1.5">
          {result.segments.map((seg, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-lg"
            >
              <div className="text-sm font-medium text-slate-700">
                {t.segmentLabel} {i + 1}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono">
                  {(seg.flood_prob * 100).toFixed(0)}%
                </span>
                <RiskBadge level={seg.risk_level} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
