import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import type {
  JournalIntentMatch,
  JournalIntentStatus,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'

function decisionAllowsReady(decision: string): boolean {
  return (
    !decision ||
    decision === 'PASS' ||
    decision === 'ALLOW' ||
    decision === 'ACCEPTED' ||
    decision === 'VALID'
  )
}

/**
 * CON-P0-10 — map authoritative Service 2 fields exhaustively.
 * Never invent Ready for Dispatch when governance/lifecycle is missing or held.
 */
export function mapJournalIntentDecision(item: {
  status?: string | null
  governance_state?: string | null
  governance_decision?: string | null
  intent_lifecycle_state?: string | null
  business_state?: string | null
}): {
  status: JournalIntentStatus
  match: JournalIntentMatch
  infoSummary: string
  engineStatus?: string
} {
  const st = String(item.status ?? '').trim().toUpperCase()
  const gov = String(item.governance_state ?? '').trim().toUpperCase()
  const decision = String(item.governance_decision ?? '').trim().toUpperCase()
  const lifecycle = String(item.intent_lifecycle_state ?? '').trim().toUpperCase()
  const biz = String(item.business_state ?? '').trim().toUpperCase()

  const hasAuthoritativeState = Boolean(gov || lifecycle || decision || st)

  if (!hasAuthoritativeState) {
    return {
      status: 'Decision unavailable',
      match: 'Awaiting',
      infoSummary: 'Decision unavailable',
      engineStatus: undefined,
    }
  }

  const rejected =
    st.includes('REJECT') ||
    st.includes('FAIL') ||
    st.includes('ERROR') ||
    decision === 'FAIL' ||
    decision === 'REJECT' ||
    decision === 'DENIED' ||
    lifecycle.includes('REJECT')

  const needsReview =
    rejected ||
    gov === 'REQUIRES_REVIEW' ||
    gov === 'FLAGGED' ||
    gov === 'REVIEW_STRICT' ||
    lifecycle === 'FLAGGED_FOR_REVIEW' ||
    lifecycle.includes('REVIEW')

  let status: JournalIntentStatus
  if (needsReview) {
    status = 'Needs Review'
  } else if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') {
    status = 'Confirmed'
  } else if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT' || biz === 'PROCESSING') {
    status = 'In Progress'
  } else if (
    (gov === 'VALID' || gov === 'ALLOW' || gov === 'ACCEPTED') &&
    (lifecycle === 'ACCEPTED' || lifecycle === 'ALLOW' || !lifecycle) &&
    decisionAllowsReady(decision)
  ) {
    status = 'Ready to Process'
  } else if (st.includes('PEND') || st.includes('CREAT') || lifecycle === 'RECEIVED') {
    status = 'Pending'
  } else if (lifecycle === 'ACCEPTED' && decisionAllowsReady(decision) && (!gov || gov === 'VALID')) {
    status = 'Ready to Process'
  } else {
    status = 'Decision unavailable'
  }

  let match: JournalIntentMatch = 'Awaiting'
  if (status === 'Confirmed') match = 'Matched'
  else if (status === 'Needs Review') match = rejected ? 'Not Found' : 'Mismatch'
  else if (status === 'Decision unavailable') match = 'Awaiting'

  const engineStatus = [item.status, item.governance_state, item.intent_lifecycle_state, item.governance_decision]
    .map((v) => apiTrimmedString(v))
    .filter(Boolean)
    .join(' · ')

  return {
    status,
    match,
    infoSummary: status === 'Decision unavailable' ? 'Decision unavailable' : engineStatus || status,
    engineStatus: engineStatus || undefined,
  }
}
