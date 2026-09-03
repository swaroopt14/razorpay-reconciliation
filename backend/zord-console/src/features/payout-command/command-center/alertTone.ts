import type { OpsInsightAlertTone } from './types'

const DEFAULT_TONE: OpsInsightAlertTone = 'caution'

const RAIL: Record<OpsInsightAlertTone, string> = {
  critical: 'bg-[#0B1324]',
  warning: 'bg-[#0B1324]',
  caution: 'bg-[#0B1324]',
  ok: 'bg-[#000000]',
}

const SHELL: Record<OpsInsightAlertTone, string> = {
  critical: 'border-[#0B1324]/20 bg-[#F1F5F9]',
  warning: 'border-[#0B1324]/20 bg-[#F1F5F9]',
  caution: 'border-[#0B1324]/15 bg-[#F1F5F9]',
  ok: 'border-black/30 bg-neutral-100',
}

export function resolveAlertTone(tone: OpsInsightAlertTone | undefined): OpsInsightAlertTone {
  return tone ?? DEFAULT_TONE
}

export function insightAlertRowChrome(tone: OpsInsightAlertTone | undefined) {
  const t = resolveAlertTone(tone)
  return { rail: RAIL[t], shell: SHELL[t] }
}
