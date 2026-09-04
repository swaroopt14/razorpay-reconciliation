import { fmtInrFull, minorToRupees } from '@/features/payout-command/command-center/commandCenterFormat'
import type { FinanceException } from '@/services/payout-command/prod-api/financeTypes'

/** Outcome-engine amount_minor is paise. */
export function formatPaise(minor: number | null | undefined, decimals: 0 | 2 = 0): string {
  const rupees = minorToRupees(minor)
  if (rupees == null) return '—'
  return fmtInrFull(rupees, { decimals })
}

export function formatPaiseCompact(minor: number | null | undefined): string {
  const rupees = minorToRupees(minor)
  if (rupees == null) return '—'
  if (Math.abs(rupees) >= 100_000) {
    const lakhs = rupees / 100_000
    const digits = lakhs >= 10 ? 1 : 2
    return `₹${lakhs.toFixed(digits)}L`
  }
  return fmtInrFull(rupees, { decimals: 0 })
}

export type ExceptionSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

export function exceptionSeverity(ex: Pick<FinanceException, 'reason' | 'variance_amount'>): ExceptionSeverity {
  if (
    ex.reason === 'failed_with_bank_movement' ||
    ex.reason === 'payout_failed_with_bank_movement' ||
    ex.reason === 'amount_mismatch' ||
    ex.variance_amount >= 1_000_000
  ) {
    return 'HIGH'
  }
  if (ex.variance_amount >= 100_000 || ex.reason === 'shared_utr_or_bank_candidates') return 'MEDIUM'
  return 'LOW'
}

export function reasonTitle(reason: string): string {
  switch (reason) {
    case 'failed_with_bank_movement':
      return 'Failed payment + money movement'
    case 'amount_mismatch':
      return 'Settlement-bank variance'
    case 'shared_utr_or_bank_candidates':
      return 'UTR conflict'
    case 'captured_missing_settlement':
      return 'Captured, missing settlement'
    case 'optimizer_settlement_unobserved':
      return 'Optimizer settlement unobserved'
    case 'ambiguous_bank_candidates':
      return 'Ambiguous bank candidates'
    case 'payout_missing_bank':
      return 'Processed, bank credit missing'
    case 'orphan_bank_credit':
      return 'Orphan bank credit'
    case 'open_status_no_downstream':
      return 'Open status, no downstream'
    case 'settlement_on_hold':
      return 'Settlement on hold'
    case 'awaiting_settlement_cycle':
      return 'Awaiting settlement cycle'
    default:
      return reason.replace(/_/g, ' ')
  }
}

export type SettlementPill = {
  label: string
  tone: 'processed' | 'pending' | 'missing' | 'review'
}

export function settlementPill(opts: {
  result?: string
  reason?: string
  bankProven?: boolean
}): SettlementPill {
  const reason = opts.reason ?? ''
  const result = (opts.result ?? '').toUpperCase()
  if (reason === 'settlement_on_hold') return { label: 'Under Review', tone: 'review' }
  if (reason === 'awaiting_settlement_cycle') return { label: 'Pending', tone: 'pending' }
  if (
    reason === 'captured_missing_settlement' ||
    reason === 'optimizer_settlement_unobserved' ||
    reason === 'failed_with_bank_movement'
  ) {
    return { label: 'Missing', tone: 'missing' }
  }
  if (result === 'MATCHED' && opts.bankProven) return { label: 'Processed', tone: 'processed' }
  if (result === 'MATCHED') return { label: 'Settled', tone: 'processed' }
  if (result === 'AMBIGUOUS') return { label: 'Pending', tone: 'pending' }
  return { label: 'Missing', tone: 'missing' }
}

export function reconLabel(result?: string): string {
  const r = (result ?? '').toUpperCase()
  if (!r) return 'Pending'
  return r
}
