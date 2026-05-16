import { useEffect, useState } from 'react'

import { api } from '../api/client'
import type { Coord, GeocodeResult } from '../types'

interface Props {
  from: Coord | null
  to: Coord | null
  onSetFrom: (coord: Coord) => void
  onSetTo: (coord: Coord) => void
  onPickFrom: () => void
  onPickTo: () => void
  onUseCurrentLocation: () => void
  onSubmit: () => void
  loading: boolean
}

type Field = 'from' | 'to'

function coordToText(coord: Coord | null): string {
  if (!coord) return ''
  return `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`
}

function parseCoordinateInput(value: string): Coord | null {
  const cleaned = value
    .trim()
    .replace(/[()]/g, '')
    .replace(/lat[:=]/gi, '')
    .replace(/lng[:=]/gi, '')
    .replace(/lon[:=]/gi, '')
    .replace(/longitude[:=]/gi, '')
    .replace(/latitude[:=]/gi, '')

  const nums = cleaned.match(/-?\d+(?:\.\d+)?/g)

  if (!nums || nums.length < 2) return null

  let a = Number(nums[0])
  let b = Number(nums[1])

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  // Normal format: lat, lng -> 10.8506, 106.7714
  let lat = a
  let lng = b

  // Also accept lng, lat -> 106.7714, 10.8506
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    lat = b
    lng = a
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { lat, lng }
}

function shortLabel(label: string): string {
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.slice(0, 4).join(', ')
}

export function RouteInput({
  from,
  to,
  onSetFrom,
  onSetTo,
  onPickFrom,
  onPickTo,
  onUseCurrentLocation,
  onSubmit,
  loading,
}: Props) {
  const [fromText, setFromText] = useState(coordToText(from))
  const [toText, setToText] = useState(coordToText(to))

  const [fromSuggestions, setFromSuggestions] = useState<GeocodeResult[]>([])
  const [toSuggestions, setToSuggestions] = useState<GeocodeResult[]>([])

  const [busyField, setBusyField] = useState<Field | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (from) setFromText(coordToText(from))
  }, [from])

  useEffect(() => {
    if (to) setToText(coordToText(to))
  }, [to])

  function applyCoord(field: Field, coord: Coord, label?: string) {
    if (field === 'from') {
      onSetFrom(coord)
      setFromText(label ?? coordToText(coord))
      setFromSuggestions([])
    } else {
      onSetTo(coord)
      setToText(label ?? coordToText(coord))
      setToSuggestions([])
    }

    setError(null)
  }

  async function resolveInput(field: Field) {
    const text = field === 'from' ? fromText : toText
    const trimmed = text.trim()

    if (!trimmed) {
      setError(`Please enter a ${field === 'from' ? 'FROM' : 'TO'} location.`)
      return
    }

    const coord = parseCoordinateInput(trimmed)

    if (coord) {
      applyCoord(field, coord)
      return
    }

    setBusyField(field)
    setError(null)

    try {
      const results = await api.geocode(trimmed, 5)

      if (results.length === 0) {
        setError(`No location found for "${trimmed}". Try adding "HCMC" or "Vietnam".`)
        return
      }

      if (field === 'from') {
        setFromSuggestions(results)
      } else {
        setToSuggestions(results)
      }

      // Auto-select the first result for speed, but still show alternatives.
      const first = results[0]
      applyCoord(
        field,
        { lat: first.lat, lng: first.lng },
        shortLabel(first.label)
      )

      if (field === 'from') setFromSuggestions(results)
      else setToSuggestions(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not geocode this location.')
    } finally {
      setBusyField(null)
    }
  }

  function renderField(field: Field) {
    const isFrom = field === 'from'
    const value = isFrom ? fromText : toText
    const setValue = isFrom ? setFromText : setToText
    const suggestions = isFrom ? fromSuggestions : toSuggestions
    const pick = isFrom ? onPickFrom : onPickTo

    return (
      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
          {isFrom ? 'From' : 'To'}
        </div>

        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (isFrom) setFromSuggestions([])
              else setToSuggestions([])
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void resolveInput(field)
              }
            }}
            placeholder={
              isFrom
                ? 'Type address or 10.7376, 106.7245'
                : 'Type address or 10.8506, 106.7714'
            }
            className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-3 font-mono text-sm text-slate-900 outline-none ring-1 ring-transparent focus:bg-white focus:ring-brand"
          />

          <button
            type="button"
            onClick={() => void resolveInput(field)}
            disabled={busyField === field}
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busyField === field ? '...' : 'Use'}
          </button>

          <button
            type="button"
            onClick={pick}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-light"
          >
            Pick
          </button>
        </div>

        {suggestions.length > 1 && (
          <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {suggestions.map((item, index) => (
              <button
                key={`${item.lat}-${item.lng}-${index}`}
                type="button"
                onClick={() =>
                  applyCoord(
                    field,
                    { lat: item.lat, lng: item.lng },
                    shortLabel(item.label)
                  )
                }
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-b-0 hover:bg-cyan-50"
              >
                <div className="font-bold text-slate-900">
                  {shortLabel(item.label)}
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-2xl">
      <div className="space-y-4">
        {renderField('from')}
        {renderField('to')}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            📍 Current location
          </button>

          <button
            type="button"
            disabled={!from || !to || loading}
            onClick={onSubmit}
            className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-black text-white hover:bg-brand-light disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? 'Calculating...' : 'Check route'}
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          You can type a place name, paste coordinates, or use Pick to select on the map.
        </div>
      </div>
    </div>
  )
}
