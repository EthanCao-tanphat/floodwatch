/**
 * LandingScreen — minimal CPU/core visual.
 * Drop at:  web/src/components/LandingScreen.tsx
 */
import { motion } from 'framer-motion'
import { LangToggle } from './LangToggle'

interface Props {
  onContinue: () => void
}

type Pt = { x: number; y: number }

interface PathSpec {
  id: string
  color: string
  duration: number
  delay: number
  points: Pt[]
}

const CPU = { x: 400, y: 240, w: 200, h: 120, rx: 24 }

const PIN = {
  topL:    { x: 467, y: 230 },
  topR:    { x: 517, y: 230 },
  botL:    { x: 467, y: 370 },
  botR:    { x: 517, y: 370 },
  leftT:   { x: 390, y: 277 },
  leftB:   { x: 390, y: 323 },
  rightT:  { x: 610, y: 277 },
  rightB:  { x: 610, y: 323 },
}

const PATHS: PathSpec[] = [
  { id: 't1', color: '#38bdf8', duration: 4.6, delay: 0.0,
    points: [{ x: -60, y:  90 }, { x: 320, y:  90 }, { x: 320, y: 200 }, { x: 467, y: 200 }, PIN.topL ] },
  { id: 't2', color: '#a78bfa', duration: 6.4, delay: 1.1,
    points: [{ x:1060, y:  60 }, { x: 700, y:  60 }, { x: 700, y: 200 }, { x: 517, y: 200 }, PIN.topR ] },
  { id: 't3', color: '#34d399', duration: 3.9, delay: 0.4,
    points: [{ x: -60, y: 540 }, { x: 300, y: 540 }, { x: 300, y: 410 }, { x: 467, y: 410 }, PIN.botL ] },
  { id: 't4', color: '#fb7185', duration: 5.5, delay: 2.2,
    points: [{ x:1060, y: 550 }, { x: 720, y: 550 }, { x: 720, y: 410 }, { x: 517, y: 410 }, PIN.botR ] },
  { id: 't5', color: '#60a5fa', duration: 4.0, delay: 1.6,
    points: [{ x: -60, y: 277 }, { x: 220, y: 277 }, PIN.leftT ] },
  { id: 't6', color: '#22d3ee', duration: 5.8, delay: 0.7,
    points: [{ x: -60, y: 380 }, { x: 200, y: 380 }, { x: 200, y: 323 }, PIN.leftB ] },
  { id: 't7', color: '#f0abfc', duration: 4.7, delay: 1.3,
    points: [{ x:1060, y: 277 }, { x: 780, y: 277 }, PIN.rightT ] },
  { id: 't8', color: '#fde047', duration: 5.2, delay: 0.2,
    points: [{ x:1060, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 323 }, PIN.rightB ] },
]

function buildRoundedPath(points: Pt[], cornerRadius = 18): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], curr = points[i], next = points[i + 1]
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y
    const len1 = Math.hypot(dx1, dy1) || 1
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y
    const len2 = Math.hypot(dx2, dy2) || 1
    const r = Math.min(cornerRadius, len1 / 2, len2 / 2)
    const beforeX = curr.x - (dx1 / len1) * r
    const beforeY = curr.y - (dy1 / len1) * r
    const afterX  = curr.x + (dx2 / len2) * r
    const afterY  = curr.y + (dy2 / len2) * r
    d += ` L ${beforeX} ${beforeY} Q ${curr.x} ${curr.y} ${afterX} ${afterY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function approxLength(points: Pt[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return len
}

export function LandingScreen({ onContinue }: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14] cursor-pointer overflow-hidden"
      onClick={onContinue}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="absolute top-6 right-6 z-10" onClick={(e) => e.stopPropagation()}>
        <LangToggle />
      </div>

      <svg viewBox="0 0 1000 600" className="w-full h-full max-w-6xl" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Layered shadow: wide ambient + tight contact for real depth */}
          <filter id="cpuShadow" x="-100%" y="-100%" width="300%" height="300%">
            {/* Ambient soft shadow */}
            <feGaussianBlur in="SourceAlpha" stdDeviation="20" result="blurA" />
            <feOffset in="blurA" dx="0" dy="18" result="offA" />
            <feComponentTransfer in="offA" result="shadowA">
              <feFuncA type="linear" slope="0.6" />
            </feComponentTransfer>
            {/* Tight contact shadow */}
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blurB" />
            <feOffset in="blurB" dx="0" dy="4" result="offB" />
            <feComponentTransfer in="offB" result="shadowB">
              <feFuncA type="linear" slope="0.8" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="shadowA" />
              <feMergeNode in="shadowB" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="streakGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="cpuHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#1e293b" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#0f172a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {PATHS.map((p) => (
          <path key={`trace-${p.id}`} d={buildRoundedPath(p.points)}
            stroke="#1e2a44" strokeWidth="1" fill="none" opacity="0.55" />
        ))}

        {PATHS.map((p) => {
          const len = approxLength(p.points)
          const streakLen = 72
          const gap = len + streakLen + 4
          return (
            <path
              key={`streak-${p.id}`}
              d={buildRoundedPath(p.points)}
              stroke={p.color}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${streakLen} ${gap}`}
              strokeDashoffset={len + streakLen}
              filter="url(#streakGlow)"
              opacity="0.95"
            >
              <animate
                attributeName="stroke-dashoffset"
                from={len + streakLen}
                to={-streakLen}
                dur={`${p.duration}s`}
                begin={`${p.delay}s`}
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.1 0.6 0.25 1"
              />
            </path>
          )
        })}

        <g filter="url(#cpuShadow)">
          <rect x="460" y="230" width="14" height="10" rx="2" fill="#1a2235" />
          <rect x="510" y="230" width="14" height="10" rx="2" fill="#1a2235" />
          <rect x="460" y="360" width="14" height="10" rx="2" fill="#1a2235" />
          <rect x="510" y="360" width="14" height="10" rx="2" fill="#1a2235" />
          <rect x="390" y="270" width="10" height="14" rx="2" fill="#1a2235" />
          <rect x="390" y="316" width="10" height="14" rx="2" fill="#1a2235" />
          <rect x="600" y="270" width="10" height="14" rx="2" fill="#1a2235" />
          <rect x="600" y="316" width="10" height="14" rx="2" fill="#1a2235" />

          <rect x={CPU.x} y={CPU.y} width={CPU.w} height={CPU.h} rx={CPU.rx}
            fill="#0d1424" stroke="#1e293b" strokeWidth="1" />
          <rect x={CPU.x + 1} y={CPU.y + 1} width={CPU.w - 2} height={CPU.h - 2} rx={CPU.rx - 1}
            fill="url(#cpuHighlight)" opacity="0.6" />
          <rect x={CPU.x + 1} y={CPU.y + 1} width={CPU.w - 2} height={CPU.h - 2} rx={CPU.rx - 1}
            fill="none" stroke="#293548" strokeWidth="0.5" opacity="0.5" />
        </g>

        <text
          x={CPU.x + CPU.w / 2}
          y={CPU.y + CPU.h / 2 + 9}
          textAnchor="middle"
          fill="#e8edf6"
          fontSize="26"
          fontWeight="600"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ letterSpacing: '-0.01em' }}
        >
          FloodWatch
        </text>
      </svg>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-500 text-xs tracking-[0.3em] uppercase select-none">
        click to enter
      </div>
    </motion.div>
  )
}