import { useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

export function FloatingPanel({ children }: Props) {
  const [expanded, setExpanded] = useState(false)
  const dragStartYRef = useRef<number | null>(null)
  const handledDragRef = useRef(false)

  function finishDrag(y: number) {
    if (dragStartYRef.current === null) return

    const delta = y - dragStartYRef.current
    dragStartYRef.current = null

    if (delta < -28) {
      handledDragRef.current = true
      setExpanded(true)
    } else if (delta > 28) {
      handledDragRef.current = true
      setExpanded(false)
    }
  }

  return (
    <div
      className="mobile-bottom-sheet fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:left-4 sm:top-[92px] sm:z-40 sm:w-[min(448px,calc(100vw-24px))]"
      style={{
        maxHeight: expanded
          ? 'calc(88dvh - env(safe-area-inset-bottom))'
          : 'calc(58dvh - env(safe-area-inset-bottom))',
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (handledDragRef.current) {
            handledDragRef.current = false
            return
          }
          setExpanded((value) => !value)
        }}
        onPointerDown={(event) => {
          dragStartYRef.current = event.clientY
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={(event) => finishDrag(event.clientY)}
        onPointerCancel={() => {
          dragStartYRef.current = null
        }}
        className="mx-auto mb-2 flex h-8 w-24 items-center justify-center rounded-full sm:hidden"
        aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        aria-expanded={expanded}
      >
        <span className="h-1.5 w-12 rounded-full bg-slate-300/90" />
      </button>

      <div
        className={`mobile-bottom-sheet-scroll overflow-y-auto rounded-t-[28px] overscroll-contain bg-transparent pb-[env(safe-area-inset-bottom)] sm:max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-0 ${
          expanded
            ? 'max-h-[calc(88dvh-2.5rem-env(safe-area-inset-bottom))]'
            : 'max-h-[calc(58dvh-2.5rem-env(safe-area-inset-bottom))]'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
