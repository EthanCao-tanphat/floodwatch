import type { LayerKey, LayerSettings, StatusResponse } from '../types'

interface Props {
  status: StatusResponse | null
  layers: LayerSettings
  onToggleLayer: (key: LayerKey) => void
  onClose: () => void
}

const LAYER_ROWS: {
  key: LayerKey
  name: string
  detail: (status: StatusResponse | null) => string
}[] = [
  {
    key: 'routeSegments',
    name: 'Route risk segments',
    detail: () => 'Color-coded passability chunks along the selected route',
  },
  {
    key: 'segmentNumbers',
    name: 'Segment numbers',
    detail: () => 'Numbered bubbles used during demo explanation',
  },
  {
    key: 'alternatives',
    name: 'Alternative routes',
    detail: () => 'Dimmed dashed paths checked by FloodWatch',
  },
  {
    key: 'hotspots',
    name: 'Historical flood hotspots',
    detail: (status) => `${status?.flood_hotspots ?? 0} Vietnam historical/proxy hotspots loaded`,
  },
  {
    key: 'reports',
    name: 'Rider photo reports',
    detail: (status) => `${status?.active_reports ?? 0} active report(s) in this session`,
  },
  {
    key: 'weatherAlerts',
    name: 'Live rainfall watch',
    detail: () => 'Open-Meteo forecast points refreshed with map evidence',
  },
]

export function LayersPanel({ status, layers, onToggleLayer, onClose }: Props) {
  return (
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">Data layers</h2>
          <p className="text-xs text-slate-500">
            Toggle the evidence FloodWatch uses to explain route risk
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
        {LAYER_ROWS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            onClick={() => onToggleLayer(layer.key)}
            className="flex w-full items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-left hover:bg-cyan-50"
          >
            <span
              className={`mt-1 h-5 w-5 rounded-md border flex items-center justify-center text-xs font-black ${
                layers[layer.key]
                  ? 'border-cyan-500 bg-cyan-500 text-white'
                  : 'border-slate-300 bg-white text-transparent'
              }`}
            >
              ✓
            </span>

            <span>
              <span className="block font-semibold text-sm">{layer.name}</span>
              <span className="block text-xs text-slate-500">
                {layer.detail(status)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-cyan-50 border border-cyan-100 p-3 text-xs text-cyan-900">
        H markers are historical susceptibility, W markers are live rainfall forecast, and R markers are rider reports. Route segments are the prediction result.
      </div>
    </div>
  )
}
