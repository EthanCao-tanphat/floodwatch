import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

interface Point {
  x: number
  y: number
}

interface DragState {
  startX: number
  startY: number
  baseX: number
  baseY: number
}

const SIDEBAR_SAFE_LEFT = 84
const EDGE_PADDING = 16
const PANEL_WIDTH = 440

export function FloatingPanel({ children, title = 'FloodWatch controls' }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const [position, setPosition] = useState<Point>({ x: SIDEBAR_SAFE_LEFT, y: 88 })
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)

  const clampPosition = useCallback((next: Point): Point => {
    const panel = panelRef.current
    const width = panel?.offsetWidth ?? Math.min(PANEL_WIDTH, window.innerWidth - 112)
    const height = panel?.offsetHeight ?? 360

    const maxX = Math.max(SIDEBAR_SAFE_LEFT, window.innerWidth - width - EDGE_PADDING)
    const maxY = Math.max(EDGE_PADDING, window.innerHeight - Math.min(height, window.innerHeight - 24) - EDGE_PADDING)

    return {
      x: Math.min(Math.max(next.x, SIDEBAR_SAFE_LEFT), maxX),
      y: Math.min(Math.max(next.y, EDGE_PADDING), maxY),
    }
  }, [])

  const resetPosition = useCallback(() => {
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 112)

    setPosition(
      clampPosition({
        x: window.innerWidth - width - 24,
        y: 88,
      })
    )

    setReady(true)
  }, [clampPosition])

  useEffect(() => {
    resetPosition()
  }, [resetPosition])

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev))
    }

    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [clampPosition])

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY

      setPosition(
        clampPosition({
          x: drag.baseX + dx,
          y: drag.baseY + dy,
        })
      )
    }

    const onUp = () => {
      dragRef.current = null
      setDragging(false)
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
  }, [clampPosition])

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    }

    setDragging(true)
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      ref={panelRef}
      className={`fixed z-40 transition-shadow ${
        dragging ? 'shadow-2xl ring-2 ring-cyan-300' : 'shadow-xl'
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: `min(${PANEL_WIDTH}px, calc(100vw - 112px))`,
        maxHeight: 'calc(100vh - 32px)',
        opacity: ready ? 1 : 0,
      }}
    >
      <div
        onPointerDown={startDrag}
        className="mb-2 flex cursor-grab items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-slate-800 shadow-sm backdrop-blur active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none text-slate-400">⋮⋮</span>
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">
            {title}
          </span>
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={resetPosition}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
        >
          Reset
        </button>
      </div>

      <div className="max-h-[calc(100vh-104px)] overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  )
}
