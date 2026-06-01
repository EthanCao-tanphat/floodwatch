import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from 'react'

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
  const contentPullStartYRef = useRef<number | null>(null)
  const contentPullActiveRef = useRef(false)
  const handledDragRef = useRef(false)
  const quickCollapseDeltaVh = 2.5
  const dismissDeltaVh = 8

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

  function isExpanded() {
    return heightVh >= (midHeightVh + maxHeightVh) / 2
  }

  function updateDrag(y: number) {
    if (dragStartYRef.current === null) return

    const deltaVh = ((dragStartYRef.current - y) / window.innerHeight) * 100
    setHeightVh(clampHeight(dragStartHeightRef.current + deltaVh))
  }

  function startDrag(y: number) {
    dragStartYRef.current = y
    dragStartHeightRef.current = heightVh
    setDragging(true)
  }

  function finishDrag(y: number) {
    if (dragStartYRef.current === null) return

    const deltaVh = ((dragStartYRef.current - y) / window.innerHeight) * 100
    const expandedThreshold = (midHeightVh + maxHeightVh) / 2
    const startedExpanded = dragStartHeightRef.current >= expandedThreshold
    const startedMidOrLower = dragStartHeightRef.current <= midHeightVh + 2
    const nextHeight = clampHeight(dragStartHeightRef.current + deltaVh)
    const nextSnap = snapHeight(nextHeight)

    dragStartYRef.current = null
    setDragging(false)
    handledDragRef.current = Math.abs(deltaVh) > 1.5

    if (dismissOnMin && startedMidOrLower && deltaVh < -dismissDeltaVh) {
      onDismiss?.()
      return
    }

    if (startedExpanded && deltaVh < -quickCollapseDeltaVh) {
      setHeightVh(midHeightVh)
      return
    }

    setHeightVh(nextSnap)
  }

  function resetContentPull() {
    contentPullStartYRef.current = null
    contentPullActiveRef.current = false
  }

  function cancelDrag() {
    dragStartYRef.current = null
    setDragging(false)
    resetContentPull()
  }

  function handleTouchStart(y: number) {
    startDrag(y)
  }

  function handleTouchMove(event: TouchEvent, y: number) {
    event.preventDefault()
    updateDrag(y)
  }

  function handleTouchEnd(y: number) {
    finishDrag(y)
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
              value >= (midHeightVh + maxHeightVh) / 2 ? midHeightVh : maxHeightVh
            )
          }}
          onPointerDown={(event) => {
            startDrag(event.clientY)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => updateDrag(event.clientY)}
          onPointerUp={(event) => finishDrag(event.clientY)}
          onPointerCancel={() => {
            cancelDrag()
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0]
            if (!touch) return
            handleTouchStart(touch.clientY)
          }}
          onTouchMove={(event) => {
            const touch = event.touches[0]
            if (!touch) return
            handleTouchMove(event, touch.clientY)
          }}
          onTouchEnd={(event) => {
            const touch = event.changedTouches[0]
            if (!touch) return
            handleTouchEnd(touch.clientY)
          }}
          onTouchCancel={() => {
            cancelDrag()
          }}
          className="flex h-14 w-full touch-none items-center justify-center rounded-t-[28px] sm:hidden"
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
          className="mobile-bottom-sheet-scroll h-[calc(100%-3.5rem)] overflow-y-auto overscroll-contain bg-white pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] sm:rounded-xl sm:bg-transparent sm:pb-0"
          onPointerDown={(event) => {
            if (
              event.pointerType === 'mouse' ||
              (!isExpanded() && event.currentTarget.scrollTop > 0)
            ) {
              resetContentPull()
              return
            }

            contentPullStartYRef.current = event.clientY
            contentPullActiveRef.current = false
          }}
          onPointerMove={(event) => {
            const startY = contentPullStartYRef.current

            if (startY === null) return

            const dy = event.clientY - startY

            if (!contentPullActiveRef.current) {
              if ((!isExpanded() && event.currentTarget.scrollTop > 0) || dy < 8) return

              contentPullActiveRef.current = true
              startDrag(startY)
              event.currentTarget.setPointerCapture(event.pointerId)
            }

            event.preventDefault()
            updateDrag(event.clientY)
          }}
          onPointerUp={(event) => {
            if (contentPullActiveRef.current) {
              finishDrag(event.clientY)
            }

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }

            resetContentPull()
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }

            cancelDrag()
          }}
          onTouchStart={(event) => {
            if (!isExpanded() && event.currentTarget.scrollTop > 0) {
              resetContentPull()
              return
            }

            const touch = event.touches[0]
            if (!touch) return

            contentPullStartYRef.current = touch.clientY
            contentPullActiveRef.current = false
          }}
          onTouchMove={(event) => {
            const touch = event.touches[0]
            const startY = contentPullStartYRef.current

            if (!touch || startY === null) return

            const dy = touch.clientY - startY

            if (!contentPullActiveRef.current) {
              if ((!isExpanded() && event.currentTarget.scrollTop > 0) || dy < 8) return

              contentPullActiveRef.current = true
              startDrag(startY)
            }

            handleTouchMove(event, touch.clientY)
          }}
          onTouchEnd={(event) => {
            const touch = event.changedTouches[0]

            if (touch && contentPullActiveRef.current) {
              handleTouchEnd(touch.clientY)
            }

            resetContentPull()
          }}
          onTouchCancel={() => {
            cancelDrag()
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
