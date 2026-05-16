import { useRef, useState } from 'react'
import { api, fileToBase64 } from '../api/client'
import { useT } from '../i18n/context'
import type { Passability } from '../types'

const PASSABILITY_VISUAL: Record<Passability, { marker: string; color: string }> = {
  safe: { marker: 'OK', color: 'text-risk-low' },
  slow_pass: { marker: 'SLOW', color: 'text-risk-moderate' },
  avoid_for_motorbikes: { marker: 'AVOID', color: 'text-risk-high' },
  impassable: { marker: 'STOP', color: 'text-risk-severe' },
  unknown: { marker: '?', color: 'text-slate-500' },
}

interface Props {
  onClose: () => void
}

interface Reading {
  passability: Passability
  confidence: number
  reasoning: string
}

export function PhotoReport({ onClose }: Props) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)

  const passabilityLabel: Record<Passability, string> = {
    safe: t.passabilitySafe,
    slow_pass: t.passabilitySlowPass,
    avoid_for_motorbikes: t.passabilityAvoid,
    impassable: t.passabilityImpassable,
    unknown: t.passabilityUnknown,
  }

  async function onFile(file: File) {
    setBusy(true)
    setError(null)
    setReading(null)
    try {
      const base64 = await fileToBase64(file)
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null)
        navigator.geolocation.getCurrentPosition(
          (p) => res(p),
          () => res(null),
          { timeout: 5000 }
        )
      })
      const lat = pos?.coords.latitude ?? 10.8506
      const lng = pos?.coords.longitude ?? 106.7714
      const result = await api.reportDepth(base64, lat, lng)
      setReading({
        passability: result.passability,
        confidence: result.confidence,
        reasoning: result.reasoning,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.photoUnknownError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-semibold text-slate-900">{t.photoTitle}</div>
          <div className="text-xs text-slate-500 mt-0.5">{t.photoSubtitle}</div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xl leading-none"
        >
          x
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />

      {!reading && !busy && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-4 bg-brand text-white rounded-xl font-semibold hover:bg-brand-light transition"
        >
          {t.photoTakePhoto}
        </button>
      )}

      {busy && (
        <div className="py-6 text-center text-sm text-slate-600">{t.photoAnalyzing}</div>
      )}

      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {reading && (
        <div className="space-y-2">
          <div className={`text-2xl font-bold ${PASSABILITY_VISUAL[reading.passability].color}`}>
            {PASSABILITY_VISUAL[reading.passability].marker} {passabilityLabel[reading.passability]}
          </div>
          <div className="text-xs text-slate-500">
            {t.photoConfidence}: {(reading.confidence * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
            {reading.reasoning}
          </div>
          <button
            onClick={() => {
              setReading(null)
              setError(null)
              inputRef.current?.click()
            }}
            className="w-full py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
          >
            {t.photoReportAnother}
          </button>
        </div>
      )}
    </div>
  )
}
