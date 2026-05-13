import type { Coord } from '../types'
import { useT } from '../i18n/context'

interface Props {
  from: Coord | null
  to: Coord | null
  onPickFrom: () => void
  onPickTo: () => void
  onUseCurrentLocation: () => void
  onSubmit: () => void
  loading: boolean
}

function fmt(c: Coord | null, fallback: string) {
  if (!c) return fallback
  return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`
}

export function RouteInput({
  from,
  to,
  onPickFrom,
  onPickTo,
  onUseCurrentLocation,
  onSubmit,
  loading,
}: Props) {
  const { t } = useT()
  const canSubmit = from && to && !loading

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 space-y-3">
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          {t.fromLabel}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono">
            {fmt(from, t.notSelected)}
          </div>
          <button
            onClick={onPickFrom}
            className="px-3 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition"
          >
            {t.pick}
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          {t.toLabel}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono">
            {fmt(to, t.notSelected)}
          </div>
          <button
            onClick={onPickTo}
            className="px-3 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light transition"
          >
            {t.pick}
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onUseCurrentLocation}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
        >
          {t.useCurrentLocation}
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 px-3 py-2 bg-brand text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-light transition"
        >
          {loading ? t.checking : t.checkFlood}
        </button>
      </div>
    </div>
  )
}
