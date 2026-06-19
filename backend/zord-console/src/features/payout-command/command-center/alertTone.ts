import type { OpsInsightAlertTone } from './types'

const DEFAULT_TONE: OpsInsightAlertTone = 'caution'

const RAIL: Record<OpsInsightAlertTone, string> = {
  critical: 'bg-[#dc2626]',
  warning: 'bg-[#f59e0b]',
  caution: 'bg-[#ca8a04]',
  ok: 'bg-[#000000]',
}

const SHELL: Record<OpsInsightAlertTone, string> = {
  critical: 'border-red-200/70 bg-red-50/75',
  warning: 'border-amber-200/80 bg-amber-50/80',
  caution: 'border-amber-200/50 bg-amber-50/45',
  ok: 'border-black/30 bg-neutral-100',
}

export function resolveAlertTone(tone: OpsInsightAlertTone | undefined): OpsInsightAlertTone {
  return tone ?? DEFAULT_TONE
}

export function insightAlertRowChrome(tone: OpsInsightAlertTone | undefined) {
  const t = resolveAlertTone(tone)
  return { rail: RAIL[t], shell: SHELL[t] }
}
