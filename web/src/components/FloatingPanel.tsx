import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

export function FloatingPanel({ children }: Props) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:left-4 sm:top-[92px] sm:z-40 sm:w-[min(448px,calc(100vw-24px))]"
      style={{
        maxHeight: 'calc(88dvh - env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/90 sm:hidden" />

      <div className="max-h-[calc(88dvh-env(safe-area-inset-bottom))] overflow-y-auto rounded-t-[28px] overscroll-contain bg-transparent pb-[env(safe-area-inset-bottom)] sm:max-h-[calc(100dvh-104px-env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-0">
        {children}
      </div>
    </div>
  )
}
