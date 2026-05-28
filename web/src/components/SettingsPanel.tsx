import type { StatusResponse } from '../types'

interface Props {
  apiOk: boolean | null
  status: StatusResponse | null
  onClose: () => void
}

export function SettingsPanel({ apiOk, status, onClose }: Props) {
  return (
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">Settings</h2>
          <p className="text-xs text-slate-500">Demo configuration</p>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between rounded-xl bg-slate-50 p-3">
          <span className="text-slate-500">Backend</span>
          <span className={apiOk ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
            {apiOk === true ? 'Online' : apiOk === false ? 'Offline' : 'Checking'}
          </span>
        </div>

        <div className="flex justify-between rounded-xl bg-slate-50 p-3">
          <span className="text-slate-500">Coverage</span>
          <span className="font-bold">{status?.pilot_city ?? 'Vietnam tiers'}</span>
        </div>

        <div className="flex justify-between rounded-xl bg-slate-50 p-3">
          <span className="text-slate-500">Prediction window</span>
          <span className="font-bold">30–60 min</span>
        </div>

        <div className="flex justify-between rounded-xl bg-slate-50 p-3">
          <span className="text-slate-500">Vehicle mode</span>
          <span className="font-bold">Selected in routes</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-slate-900 text-white p-3 text-xs">
        FloodWatch uses tiered Vietnam coverage: strongest prediction in HCMC,
        partial city evidence where seeded, and rainfall/report warnings elsewhere.
      </div>
    </div>
  )
}
