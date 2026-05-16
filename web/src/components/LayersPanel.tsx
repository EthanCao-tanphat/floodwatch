import type { StatusResponse } from '../types'

interface Props {
  status: StatusResponse | null
  onClose: () => void
}

export function LayersPanel({ status, onClose }: Props) {
  const layers = [
    {
      name: 'Rain forecast',
      detail: `${(status?.rain_now_mm ?? 0).toFixed(1)}mm now from forecast feed`,
    },
    {
      name: 'Tide level',
      detail: `${(status?.tide_level_m ?? 0).toFixed(2)}m reference tide signal`,
    },
    {
      name: 'Historical flood hotspots',
      detail: `${status?.flood_hotspots ?? 0} HCMC pilot hotspots loaded`,
    },
    {
      name: 'Drainage proxy',
      detail: 'Included in per-segment risk evidence',
    },
    {
      name: 'Rider photo reports',
      detail: `${status?.active_reports ?? 0} active report(s) in this demo session`,
    },
  ]

  return (
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">Data layers</h2>
          <p className="text-xs text-slate-500">
            Signals used by the FloodWatch scoring model
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
          aria-label="Close layers"
        >
          ×
        </button>
      </div>

      <div className="space-y-2">
        {layers.map((layer) => (
          <label
            key={layer.name}
            className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3"
          >
            <input
              type="checkbox"
              checked
              readOnly
              className="mt-1 accent-cyan-500"
            />

            <div>
              <div className="font-semibold text-sm">{layer.name}</div>
              <div className="text-xs text-slate-500">{layer.detail}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-cyan-50 border border-cyan-100 p-3 text-xs text-cyan-900">
        For the preliminary demo, these layers are surfaced as evidence and route
        scoring signals. Full map layer toggles can be built for the final round.
      </div>
    </div>
  )
}
