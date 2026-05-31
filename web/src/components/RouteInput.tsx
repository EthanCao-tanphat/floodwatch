import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { useT } from '../i18n/context'
import type { Coord, GeocodeResult, PlaceResolveResponse, SearchSuggestion, StatusResponse, TravelMode } from '../types'

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
  travelMode: TravelMode
  onSetTravelMode: (mode: TravelMode) => void
  status: StatusResponse | null
}

type Field = 'from' | 'to'

interface RecentPlace extends GeocodeResult {
  last_used_at: number
}

const RECENT_STORAGE_KEY = 'floodwatch_recent_places_v1'
const MAX_RECENT_PLACES = 8

const TRAVEL_MODES: Array<{ id: TravelMode; labelKey: 'travelMotorbike' | 'travelCar' | 'travelWalk' | 'travelBicycle' | 'travelTransit' }> = [
  { id: 'motorbike', labelKey: 'travelMotorbike' },
  { id: 'car', labelKey: 'travelCar' },
  { id: 'walk', labelKey: 'travelWalk' },
  { id: 'bicycle', labelKey: 'travelBicycle' },
  { id: 'transit', labelKey: 'travelTransit' },
]

function coordToText(coord: Coord | null): string {
  if (!coord) return ''
  return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`
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

  const a = Number(nums[0])
  const b = Number(nums[1])

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  let lat = a
  let lng = b

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

function placeKey(place: Pick<GeocodeResult, 'lat' | 'lng' | 'label'>): string {
  return `${place.lat.toFixed(5)},${place.lng.toFixed(5)}:${shortLabel(place.label).toLowerCase()}`
}

function readRecentPlaces(): RecentPlace[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => {
        return (
          item &&
          item.source !== 'coordinates' &&
          typeof item.label === 'string' &&
          typeof item.lat === 'number' &&
          typeof item.lng === 'number'
        )
      })
      .slice(0, MAX_RECENT_PLACES)
  } catch {
    return []
  }
}

function writeRecentPlaces(places: RecentPlace[]) {
  try {
    window.localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(places.slice(0, MAX_RECENT_PLACES))
    )
  } catch {
    // Local storage can be blocked in private browser modes.
  }
}

function makeSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function resolvedToGeocode(place: PlaceResolveResponse): GeocodeResult {
  return {
    label: place.label,
    lat: place.lat,
    lng: place.lng,
    source: place.source || place.provider,
    place_id: place.place_id,
  }
}

function suggestionToGeocode(suggestion: SearchSuggestion): GeocodeResult | null {
  if (suggestion.needs_resolve || suggestion.lat == null || suggestion.lng == null) {
    return null
  }

  return {
    label: suggestion.description || [suggestion.title, suggestion.subtitle].filter(Boolean).join(', '),
    lat: suggestion.lat,
    lng: suggestion.lng,
    source: suggestion.source || suggestion.provider,
    place_id: suggestion.place_id,
  }
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
  travelMode,
  onSetTravelMode,
  status,
}: Props) {
  const { t } = useT()
  const [fromText, setFromText] = useState(coordToText(from))
  const [toText, setToText] = useState(coordToText(to))

  const [fromSuggestions, setFromSuggestions] = useState<SearchSuggestion[]>([])
  const [toSuggestions, setToSuggestions] = useState<SearchSuggestion[]>([])

  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>(() => readRecentPlaces())
  const [sessionToken] = useState(makeSessionToken)

  const [activeField, setActiveField] = useState<Field | null>(null)
  const [busyField, setBusyField] = useState<Field | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (from && activeField !== 'from') setFromText(coordToText(from))
  }, [from, activeField])

  useEffect(() => {
    if (to && activeField !== 'to') setToText(coordToText(to))
  }, [to, activeField])

  useEffect(() => {
    if (!activeField) return

    const field = activeField
    const text = field === 'from' ? fromText.trim() : toText.trim()

    if (!text || text.length < 2 || parseCoordinateInput(text)) {
      if (field === 'from') setFromSuggestions([])
      else setToSuggestions([])
      return
    }

    let alive = true

    const id = window.setTimeout(async () => {
      setBusyField(field)

      try {
        const bias = field === 'from' ? to ?? from : from ?? to
        const results = await api.searchSuggest(text, 7, sessionToken, bias, false)

        if (!alive) return

        if (field === 'from') setFromSuggestions(results)
        else setToSuggestions(results)
      } catch {
        if (!alive) return

        if (field === 'from') setFromSuggestions([])
        else setToSuggestions([])
      } finally {
        if (alive) {
          setBusyField((current) => (current === field ? null : current))
        }
      }
    }, 260)

    return () => {
      alive = false
      window.clearTimeout(id)
    }
  }, [activeField, from, fromText, sessionToken, to, toText])

  function saveRecentPlace(place: GeocodeResult) {
    if (place.source === 'coordinates') return

    const nextPlace: RecentPlace = {
      label: place.label,
      lat: place.lat,
      lng: place.lng,
      source: place.source,
      importance: place.importance,
      last_used_at: Date.now(),
    }

    setRecentPlaces((prev) => {
      const key = placeKey(nextPlace)

      const next = [
        nextPlace,
        ...prev.filter((item) => placeKey(item) !== key),
      ].slice(0, MAX_RECENT_PLACES)

      writeRecentPlaces(next)

      return next
    })
  }

  function clearRecentPlaces() {
    setRecentPlaces([])
    writeRecentPlaces([])
  }

  function selectPlace(field: Field, place: GeocodeResult) {
    const coord = { lat: place.lat, lng: place.lng }
    const label = shortLabel(place.label)

    if (field === 'from') {
      onSetFrom(coord)
      setFromText(label)
      setFromSuggestions([])
    } else {
      onSetTo(coord)
      setToText(label)
      setToSuggestions([])
    }

    saveRecentPlace(place)
    setActiveField(null)
    setError(null)
  }

  async function selectSuggestion(field: Field, suggestion: SearchSuggestion) {
    setBusyField(field)

    try {
      const localPlace = suggestionToGeocode(suggestion)
      const place = localPlace ?? resolvedToGeocode(
        await api.searchResolve(suggestion, sessionToken)
      )

      selectPlace(field, place)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.couldNotResolvePlace)
    } finally {
      setBusyField((current) => (current === field ? null : current))
    }
  }

  function applyManualCoord(field: Field, coord: Coord) {
    const label = coordToText(coord)

    const place: GeocodeResult = {
      label,
      lat: coord.lat,
      lng: coord.lng,
      source: 'coordinates',
      importance: 1,
    }

    selectPlace(field, place)
  }

  async function resolveInput(field: Field) {
    const text = field === 'from' ? fromText : toText
    const trimmed = text.trim()

    if (!trimmed) {
      setError(field === 'from' ? t.enterStart : t.enterDestination)
      setActiveField(field)
      return
    }

    const coord = parseCoordinateInput(trimmed)

    if (coord) {
      applyManualCoord(field, coord)
      return
    }

    const suggestions = field === 'from' ? fromSuggestions : toSuggestions

    if (suggestions.length > 0) {
      await selectSuggestion(field, suggestions[0])
      return
    }

    setBusyField(field)
    setError(null)

    try {
      const bias = field === 'from' ? to ?? from : from ?? to
      const results = await api.searchSuggest(trimmed, 7, sessionToken, bias, true)

      if (results.length === 0) {
        setError(t.noLocationFound)
        return
      }

      await selectSuggestion(field, results[0])

      if (field === 'from') setFromSuggestions(results)
      else setToSuggestions(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.couldNotSearchPlace)
    } finally {
      setBusyField((current) => (current === field ? null : current))
    }
  }

  function renderPlaceRow(field: Field, place: GeocodeResult, recent = false) {
    return (
      <button
        key={`${recent ? 'recent' : 'suggest'}-${place.lat}-${place.lng}-${place.label}`}
        type="button"
        onClick={() => selectPlace(field, place)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          {recent ? <ClockIcon className="h-5 w-5" /> : <SearchMiniIcon className="h-5 w-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">
            {shortLabel(place.label)}
          </span>

          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {place.lat.toFixed(5)}, {place.lng.toFixed(5)} · {sourceLabel(place.source)}
          </span>
        </span>
      </button>
    )
  }

  function renderSuggestionRow(field: Field, suggestion: SearchSuggestion) {
    const subtitle = suggestion.subtitle || sourceLabel(suggestion.source)

    return (
      <button
        key={`${suggestion.provider}-${suggestion.place_id}`}
        type="button"
        onClick={() => void selectSuggestion(field, suggestion)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <SearchMiniIcon className="h-5 w-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">
            {suggestion.title}
          </span>

          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {subtitle} · {providerLabel(suggestion.provider)}
          </span>
        </span>
      </button>
    )
  }

  function renderDropdown(field: Field) {
    if (activeField !== field) return null

    const value = field === 'from' ? fromText.trim() : toText.trim()
    const suggestions = field === 'from' ? fromSuggestions : toSuggestions
    const showRecent = !value && recentPlaces.length > 0
    const showSuggestions = value && suggestions.length > 0

    if (!showRecent && !showSuggestions && busyField !== field) return null

    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.2)]">
        {busyField === field && (
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
            {t.searchingPlaces}
          </div>
        )}

        {showRecent && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t.recentSearches}
              </div>

              <button
                type="button"
                onClick={clearRecentPlaces}
                className="text-xs font-bold text-cyan-700 hover:text-cyan-500"
              >
                {t.clear}
              </button>
            </div>

            {recentPlaces.map((place) => renderPlaceRow(field, place, true))}
          </>
        )}

        {showSuggestions && (
          <>
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-400">
              {t.suggestions}
            </div>

            {suggestions.map((place) => renderSuggestionRow(field, place))}
          </>
        )}
      </div>
    )
  }

  function renderField(field: Field) {
    const isFrom = field === 'from'
    const value = isFrom ? fromText : toText
    const setValue = isFrom ? setFromText : setToText
    const pick = isFrom ? onPickFrom : onPickTo

    return (
      <div className="relative">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs font-black uppercase tracking-wide text-slate-400">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isFrom ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          {isFrom ? t.start : t.destination}
        </div>

        <div
          className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-sm transition ${
            activeField === field
              ? 'border-cyan-300 ring-4 ring-cyan-100'
              : 'border-slate-200'
          }`}
        >
          <SearchMiniIcon className="h-5 w-5 shrink-0 text-slate-400" />

          <input
            value={value}
            onFocus={() => setActiveField(field)}
            onChange={(e) => {
              setValue(e.target.value)
              setActiveField(field)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void resolveInput(field)
              }

              if (e.key === 'Escape') {
                setActiveField(null)
              }
            }}
            placeholder={
              isFrom
                ? t.chooseStartingPoint
                : t.chooseDestination
            }
            className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
          />

          {value && (
            <button
              type="button"
              onClick={() => {
                setValue('')
                setActiveField(field)

                if (isFrom) setFromSuggestions([])
                else setToSuggestions([])
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={t.clear}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveField(null)
              pick()
            }}
            className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-200"
          >
            {t.pick}
          </button>
        </div>

        {renderDropdown(field)}
      </div>
    )
  }

  return (
    <div className="overflow-visible rounded-t-[28px] border border-slate-200 bg-white text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.18)] sm:rounded-xl">
      <div className="border-b border-slate-100 px-5 py-4">
        <TravelModePicker value={travelMode} onChange={onSetTravelMode} />
      </div>

      <div className="space-y-3 px-4 py-4 sm:space-y-4 sm:px-5 sm:py-5">
        <FloodSituation status={status} />
        {renderField('from')}
        {renderField('to')}

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
          >
            <CurrentLocationIcon className="h-5 w-5" />
            {t.useCurrentLocation}
          </button>

          <button
            type="button"
            disabled={!from || !to || loading}
            onClick={onSubmit}
            className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            <RouteIcon className="h-5 w-5" />
            {loading ? t.checking : t.checkFlood}
          </button>
        </div>

        {travelMode === 'transit' && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800 ring-1 ring-amber-100">
            {t.transitPreviewNote}
          </div>
        )}
      </div>
    </div>
  )
}

function FloodSituation({ status }: { status: StatusResponse | null }) {
  const { t } = useT()
  const rain = status?.rain_now_mm ?? 0
  const tide = status?.tide_level_m ?? 0
  const reports = status?.active_reports ?? 0

  const title =
    reports > 0
      ? `${reports} ${reports === 1 ? t.activeRiderReport : t.activeRiderReports}`
      : rain >= 10
        ? t.rainSignalActive
        : tide >= 1.4
          ? t.tidePressureActive
          : t.noLiveFloodReports

  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 sm:rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            {t.currentFlooding}
          </div>

          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {title}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-500 sm:hidden">
            {t.rainShort} {rain.toFixed(1)}mm · {t.tideShort} {tide.toFixed(2)}m · {t.reportsShort} {reports}
          </div>
        </div>

        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
          {t.live}
        </span>
      </div>

      <div className="mt-3 hidden grid-cols-3 gap-2 text-xs sm:grid">
        <SituationMetric label={t.rainShort} value={`${rain.toFixed(1)}mm`} />
        <SituationMetric label={t.tideShort} value={`${tide.toFixed(2)}m`} />
        <SituationMetric label={t.reportsShort} value={String(reports)} />
      </div>
    </div>
  )
}

function SituationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-100">
      <div className="font-bold text-slate-400">{label}</div>
      <div className="mt-0.5 font-extrabold text-slate-900">{value}</div>
    </div>
  )
}

function TravelModePicker({
  value,
  onChange,
}: {
  value: TravelMode
  onChange: (mode: TravelMode) => void
}) {
  const { t } = useT()

  return (
    <div>
      <div className="text-sm font-extrabold uppercase tracking-wide text-slate-400 sm:text-base sm:normal-case sm:tracking-tight sm:text-slate-950">
        {t.directions}
      </div>

      <div className="mt-2 grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1 sm:mt-3 sm:rounded-lg">
        {TRAVEL_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`min-w-0 rounded-xl px-1 py-2 text-center transition sm:rounded-md sm:px-1.5 ${
              value === mode.id
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:bg-white/60'
            }`}
            title={t[mode.labelKey]}
          >
            <TravelModeIcon mode={mode.id} className="mx-auto h-5 w-5" />
            <div className="mt-1 truncate text-[11px] font-extrabold">
              {t[mode.labelKey]}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function TravelModeIcon({
  mode,
  className,
}: {
  mode: TravelMode
  className?: string
}) {
  if (mode === 'car') return <CarIcon className={className} />
  if (mode === 'walk') return <WalkIcon className={className} />
  if (mode === 'bicycle') return <BicycleIcon className={className} />
  if (mode === 'transit') return <TransitIcon className={className} />
  return <MotorbikeIcon className={className} />
}

function sourceLabel(source: string): string {
  if (source === 'google_places_autocomplete') return 'Google Places'
  if (source === 'google_place_details') return 'Google Places'
  if (source === 'local_hcmc_alias') return 'FloodWatch local place'
  if (source === 'nominatim') return 'OpenStreetMap'
  if (source === 'coordinates') return 'Coordinates'
  return source || 'Place'
}

function providerLabel(provider: string): string {
  if (provider === 'google') return 'Google'
  if (provider === 'local') return 'Local'
  if (provider === 'nominatim') return 'OpenStreetMap'
  return provider
}

function SearchMiniIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 6l12 12" strokeLinecap="round" />
      <path d="M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}

function CurrentLocationIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" strokeLinecap="round" />
      <path d="M12 19v3" strokeLinecap="round" />
      <path d="M2 12h3" strokeLinecap="round" />
      <path d="M19 12h3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function RouteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M15.5 5H10a4 4 0 0 0 0 8h4a4 4 0 0 1 0 8H8.5" />
    </svg>
  )
}

function MotorbikeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M8.8 17h4.4l2.2-5H18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12h3l-1.5-3H9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 10h2.8" strokeLinecap="round" />
    </svg>
  )
}

function CarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M5 12l2-5h10l2 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16v6H4z" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  )
}

function WalkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="13" cy="4.5" r="2" />
      <path d="M11 8l-2 5 4 2 1 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 9l4 3" strokeLinecap="round" />
      <path d="M10 14l-3 6" strokeLinecap="round" />
    </svg>
  )
}

function BicycleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M6 17l5-8h3l4 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 9l2 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 9h3" strokeLinecap="round" />
    </svg>
  )
}

function TransitIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M8 21l2-4" strokeLinecap="round" />
      <path d="M16 21l-2-4" strokeLinecap="round" />
      <path d="M8 8h8" strokeLinecap="round" />
      <circle cx="8.5" cy="13" r="1" />
      <circle cx="15.5" cy="13" r="1" />
    </svg>
  )
}
