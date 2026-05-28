import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

const PANEL_WIDTH = 448

export function FloatingPanel({ children }: Props) {
  return (
    <div
      className="fixed left-3 top-[88px] z-40 sm:left-4 sm:top-[92px]"
      style={{
        width: `min(${PANEL_WIDTH}px, calc(100vw - 24px))`,
        maxHeight: 'calc(100dvh - 104px - env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] overflow-y-auto rounded-xl overscroll-contain">
        {children}
      </div>
    </div>
  )
}
