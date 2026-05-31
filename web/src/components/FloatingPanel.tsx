import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
  defaultHeightVh?: number
  minHeightVh?: number
  midHeightVh?: number
  maxHeightVh?: number
  snapKey?: string
  dismissOnMin?: boolean
  onDismiss?: () => void
  onHeightChange?: (heightVh: number) => void
}

export function FloatingPanel({
  children,
  defaultHeightVh = 58,
  minHeightVh = 42,
  midHeightVh = 58,
  maxHeightVh = 88,
  snapKey,
  dismissOnMin = false,
  onDismiss,
  onHeightChange,
}: Props) {
  const [heightVh, setHeightVh] = useState(defaultHeightVh)
  const [dragging, setDragging] = useState(false)
  const dragStartYRef = useRef<number | null>(null)
  const dragStartHeightRef = useRef(defaultHeightVh)
  const handledDragRef = useRef(false)

  useEffect(() => {
    setHeightVh(defaultHeightVh)
    dragStartHeightRef.current = defaultHeightVh
  }, [defaultHeightVh, snapKey])

  useEffect(() => {
    onHeightChange?.(heightVh)
  }, [heightVh, onHeightChange])

  function clampHeight(value: number): number {
    return Math.min(maxHeightVh, Math.max(minHeightVh, value))
  }

  function snapHeight(value: number): number {
    const lowMid = (minHeightVh + midHeightVh) / 2
    const midHigh = (midHeightVh + maxHeightVh) / 2

    if (value >= midHigh) return maxHeightVh
    if (value <= lowMid) return minHeightVh
    return midHeightVh
  }

  function updateDrag(y: number) {
    if (dragStartYRef.current === null) return

    const deltaVh = ((dragStartYRef.current - y) / window.innerHeight) * 100
    setHeightVh(clampHeight(dragStartHeightRef.current + deltaVh))
  }

  function finishDrag(y: number) {
    if (dragStartYRef.current === null) return

    const deltaVh = ((dragStartYRef.current - y) / window.innerHeight) * 100
    const nextHeight = clampHeight(dragStartHeightRef.current + deltaVh)
    const nextSnap = snapHeight(nextHeight)

    dragStartYRef.current = null
    setDragging(false)
    handledDragRef.current = Math.abs(deltaVh) > 1.5

    if (dismissOnMin && deltaVh < -8 && nextSnap === minHeightVh) {
      onDismiss?.()
      return
    }

    setHeightVh(nextSnap)
  }

  return (
    <div
      className="mobile-bottom-sheet fixed inset-x-0 bottom-0 z-50 h-[var(--sheet-height)] max-h-[calc(88dvh-env(safe-area-inset-bottom))] sm:inset-auto sm:left-4 sm:top-[92px] sm:z-40 sm:h-auto sm:max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] sm:w-[min(448px,calc(100vw-24px))]"
      style={{
        '--sheet-height': `${heightVh}dvh`,
        transition: dragging ? 'none' : 'height 180ms ease',
      } as CSSProperties}
    >
      <div className="h-full overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_36px_rgba(15,23,42,0.18)] ring-1 ring-slate-200 sm:h-auto sm:rounded-xl sm:bg-transparent sm:shadow-none sm:ring-0">
        <button
          type="button"
          onClick={() => {
            if (handledDragRef.current) {
              handledDragRef.current = false
              return
            }
            setHeightVh((value) =>
              value >= (midHeightVh + maxHeightVh) / 2 ? minHeightVh : maxHeightVh
            )
          }}
          onPointerDown={(event) => {
            dragStartYRef.current = event.clientY
            dragStartHeightRef.current = heightVh
            setDragging(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => updateDrag(event.clientY)}
          onPointerUp={(event) => finishDrag(event.clientY)}
          onPointerCancel={() => {
            dragStartYRef.current = null
            setDragging(false)
          }}
          className="mx-auto flex h-8 w-24 touch-none items-center justify-center rounded-full sm:hidden"
          aria-label={
            heightVh >= (midHeightVh + maxHeightVh) / 2
              ? 'Collapse panel'
              : 'Expand panel'
          }
          aria-expanded={heightVh >= (midHeightVh + maxHeightVh) / 2}
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-300/90" />
        </button>

        <div
          className="mobile-bottom-sheet-scroll h-[calc(100%-2rem)] overflow-y-auto overscroll-contain bg-white pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] sm:rounded-xl sm:bg-transparent sm:pb-0"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
