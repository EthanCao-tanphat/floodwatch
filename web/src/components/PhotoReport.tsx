import { useRef, useState } from 'react'
import { api, fileToBase64 } from '../api/client'
import { useT } from '../i18n/context'
import type { DepthClass } from '../types'

const DEPTH_VISUAL: Record<DepthClass, { emoji: string; color: string }> = {
  dry: { emoji: '✅', color: 'text-risk-low' },
  ankle: { emoji: '💧', color: 'text-risk-moderate' },
  knee: { emoji: '🌊', color: 'text-risk-high' },
  impassable: { emoji: '⛔', color: 'text-risk-severe' },
}

interface Props {
  onClose: () => void
}

interface Reading {
  depth_class: DepthClass
  confidence: number
  reasoning: string
}

export function PhotoReport({ onClose }: Props) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)

  const depthLabel: Record<DepthClass, string> = {
    dry: t.depthDry,
    ankle: t.depthAnkle,
    knee: t.depthKnee,
    impassable: t.depthImpassable,
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
        depth_class: result.depth_class,
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
          ✕
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
          <div className={`text-2xl font-bold ${DEPTH_VISUAL[reading.depth_class].color}`}>
            {DEPTH_VISUAL[reading.depth_class].emoji} {depthLabel[reading.depth_class]}
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
