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
  onReported?: () => void
}

interface Reading {
  passability: Passability
  confidence: number
  reasoning: string
}

export function PhotoReport({ onClose, onReported }: Props) {
  const { t } = useT()

  const inputRef = useRef<HTMLInputElement | null>(null)

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

      // Default to HCMC pilot area if browser geolocation is unavailable.
      const lat = pos?.coords.latitude ?? 10.8506
      const lng = pos?.coords.longitude ?? 106.7714

      const result = await api.reportDepth(base64, lat, lng)

      setReading({
        passability: result.passability,
        confidence: result.confidence,
        reasoning: result.reasoning,
      })

      onReported?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.photoUnknownError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white/95 shadow-2xl border border-slate-200 p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">{t.photoTitle}</h2>
          <p className="text-xs text-slate-500">{t.photoSubtitle}</p>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
          aria-label="Close report"
        >
          ×
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
          if (f) void onFile(f)
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
        <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-4 text-sm text-cyan-900">
          {t.photoAnalyzing}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {reading && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
            <div className={`text-xl font-black ${PASSABILITY_VISUAL[reading.passability].color}`}>
              {PASSABILITY_VISUAL[reading.passability].marker}{' '}
              {passabilityLabel[reading.passability]}
            </div>

            <div className="mt-1 text-sm text-slate-600">
              {t.photoConfidence}: {(reading.confidence * 100).toFixed(0)}%
            </div>

            <p className="mt-3 text-sm text-slate-700 leading-relaxed">
              {reading.reasoning}
            </p>
          </div>

          <button
            onClick={() => {
              setReading(null)
              setError(null)
              inputRef.current?.click()
            }}
            className="w-full py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            {t.photoReportAnother}
          </button>
        </div>
      )}
    </div>
  )
}
