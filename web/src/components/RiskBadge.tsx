import type { RiskLevel } from '../types'
import { useT } from '../i18n/context'

interface Props {
  level: RiskLevel
  className?: string
}

export function RiskBadge({ level, className = '' }: Props) {
  const { t } = useT()
  const labelMap: Record<RiskLevel, string> = {
    low: t.riskLow,
    moderate: t.riskModerate,
    high: t.riskHigh,
    severe: t.riskSevere,
  }
  return (
    <span className={`risk-pill risk-${level} ${className}`}>{labelMap[level]}</span>
  )
}
