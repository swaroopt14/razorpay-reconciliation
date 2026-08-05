import { SANDBOX_INTENTS } from './sandbox-fixtures'
import type { CustomerIntentRow } from './_lib/customerProdApi'

export type SearchEnvironment = 'sandbox' | 'production'

export type SearchEntry = {
  id: string
  type: 'intent' | 'trace' | 'beneficiary' | 'route' | 'report' | 'evidence'
  title: string
  subtitle: string
  href: string
  keywords: string[]
}

const routeEntries = (environment: SearchEnvironment): SearchEntry[] => {
  const prefix = environment === 'sandbox' ? '/customer/sandbox' : '/customer'
  return [
    { id: `route_overview_${environment}`, type: 'route', title: 'Overview Dashboard', subtitle: 'Ops health and summary', href: `${prefix}/overview`, keywords: ['overview', 'dashboard', 'ops'] },
    { id: `route_intents_${environment}`, type: 'route', title: 'Intent Journal', subtitle: 'Search intent records', href: `${prefix}/intents`, keywords: ['intent', 'journal', 'id'] },
    { id: `route_timeline_${environment}`, type: 'route', title: 'Workflow Timeline', subtitle: 'Stage and causality timeline', href: `${prefix}/workflow-timeline`, keywords: ['workflow', 'timeline', 'stage', 'step'] },
    { id: `route_replay_${environment}`, type: 'route', title: 'Replay Simulation', subtitle: 'Deterministic replay and comparison', href: `${prefix}/intents/replay`, keywords: ['replay', 'simulate', 'compare'] },
    { id: `route_files_upload_${environment}`, type: 'route', title: 'Bulk CSV Upload', subtitle: 'File ingestion and schema checks', href: `${prefix}/files/upload`, keywords: ['csv', 'bulk', 'upload', 'file', 'ingestion'] },
    { id: `route_files_jobs_${environment}`, type: 'route', title: 'Ingestion Jobs', subtitle: 'Batch processing and errors', href: `${prefix}/files/jobs`, keywords: ['jobs', 'ingestion', 'batch', 'failed rows'] },
    { id: `route_report_rca_${environment}`, type: 'report', title: 'RCA Reports', subtitle: 'Root cause and incidents', href: `${prefix}/reports/rca`, keywords: ['rca', 'incident', 'root cause', 'failure'] },
    { id: `route_report_cost_${environment}`, type: 'report', title: 'Cost Intelligence', subtitle: 'Fee and margin analytics', href: `${prefix}/reports/cost-intelligence`, keywords: ['cost', 'mdr', 'fees', 'margin'] },
    { id: `route_report_payment_${environment}`, type: 'report', title: 'Payment Intelligence', subtitle: 'Success rate and drop reasons', href: `${prefix}/reports/payment-intelligence`, keywords: ['payment', 'success', 'failure', 'latency'] },
  ]
}

export function intentRowsToSearchEntries(
  rows: CustomerIntentRow[],
  environment: SearchEnvironment,
): SearchEntry[] {
  const intentPrefix = environment === 'sandbox' ? '/customer/sandbox/intents' : '/customer/intents'
  return rows.map((row) => ({
    id: `live_intent_${row.intent_id}`,
    type: 'intent' as const,
    title: row.intent_id,
    subtitle: `${row.status || 'intent'} · ${row.intent_type || 'payment'}`,
    href: `${intentPrefix}/${encodeURIComponent(row.intent_id)}`,
    keywords: [row.intent_id, row.status || '', row.intent_type || '', 'intent', 'live'],
  }))
}

const intentEntries = (environment: SearchEnvironment, liveIntents: SearchEntry[] = []): SearchEntry[] => {
  const intentPrefix = environment === 'sandbox' ? '/customer/sandbox/intents' : '/customer/intents'
  const evidencePrefix = environment === 'sandbox' ? '/customer/sandbox/evidence/explorer' : '/customer/evidence/explorer'

  const sandboxEntries = SANDBOX_INTENTS.flatMap((intent) => {
    const beneficiaryToken = String(intent.canonicalIntent?.beneficiary_account_token || '')
    const traceEntry: SearchEntry = {
      id: `trace_${intent.traceId}`,
      type: 'trace',
      title: intent.traceId,
      subtitle: `${intent.status} • ${intent.intentId}`,
      href: `${intentPrefix}/${encodeURIComponent(intent.intentId)}`,
      keywords: [intent.traceId, intent.intentId, intent.status, 'trace', 'timeline'],
    }

    const intentEntry: SearchEntry = {
      id: `intent_${intent.intentId}`,
      type: 'intent',
      title: intent.intentId,
      subtitle: `${intent.status} • ₹${intent.amount.toLocaleString('en-IN')} • ${intent.currency}`,
      href: `${intentPrefix}/${encodeURIComponent(intent.intentId)}`,
      keywords: [intent.intentId, intent.status, intent.reasonCode, String(intent.amount), intent.currency],
    }

    const beneficiaryEntry: SearchEntry = {
      id: `beneficiary_${intent.intentId}`,
      type: 'beneficiary',
      title: beneficiaryToken || 'beneficiary_token_unavailable',
      subtitle: `Beneficiary token • intent ${intent.intentId}`,
      href: `${intentPrefix}/${encodeURIComponent(intent.intentId)}`,
      keywords: [beneficiaryToken, 'beneficiary', 'token', intent.intentId],
    }

    const evidenceEntry: SearchEntry = {
      id: `evidence_${intent.evidencePackId}`,
      type: 'evidence',
      title: intent.evidencePackId,
      subtitle: `Evidence pack for ${intent.intentId}`,
      href: `${evidencePrefix}?intent_id=${encodeURIComponent(intent.intentId)}`,
      keywords: [intent.evidencePackId, 'evidence', intent.intentId],
    }

    return [intentEntry, traceEntry, beneficiaryEntry, evidenceEntry]
  })

  return [...liveIntents, ...sandboxEntries]
}

export function getCustomerSearchEntries(
  environment: SearchEnvironment,
  liveIntents: SearchEntry[] = [],
): SearchEntry[] {
  return [...routeEntries(environment), ...intentEntries(environment, liveIntents)]
}

export function getSmartSuggestions(query: string, environment: SearchEnvironment): SearchEntry[] {
  const normalized = query.trim().toLowerCase()
  const prefix = environment === 'sandbox' ? '/customer/sandbox' : '/customer'
  if (!normalized) return []

  const suggestions: SearchEntry[] = []
  if (normalized.includes('stage') || normalized.includes('step') || normalized.includes('workflow')) {
    suggestions.push({
      id: `smart_stage_${environment}`,
      type: 'route',
      title: 'Find stage in Workflow Timeline',
      subtitle: 'Jump to stage-wise deterministic flow',
      href: `${prefix}/workflow-timeline`,
      keywords: ['stage', 'step', 'workflow', 'timeline'],
    })
  }
  if (normalized.includes('failed') || normalized.includes('error') || normalized.includes('exception')) {
    suggestions.push({
      id: `smart_fail_${environment}`,
      type: 'route',
      title: 'Inspect failures in Work Queue',
      subtitle: 'Open actionable exceptions and retries',
      href: `${prefix}/work-queue`,
      keywords: ['failed', 'error', 'exception', 'queue'],
    })
  }
  if (normalized.includes('beneficiary') || normalized.includes('token')) {
    suggestions.push({
      id: `smart_beneficiary_${environment}`,
      type: 'route',
      title: 'Find beneficiary token in Intent Journal',
      subtitle: 'Search tokenized beneficiary references',
      href: `${prefix}/intents`,
      keywords: ['beneficiary', 'token', 'intent'],
    })
  }
  return suggestions
}

export function rankSearchEntries(query: string, entries: SearchEntry[], limit = 12): SearchEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return entries.slice(0, limit)

  const scored = entries
    .map((entry) => {
      const title = entry.title.toLowerCase()
      const subtitle = entry.subtitle.toLowerCase()
      const keywords = entry.keywords.join(' ').toLowerCase()
      let score = 0

      if (title === normalized) score += 120
      if (title.startsWith(normalized)) score += 80
      if (title.includes(normalized)) score += 50
      if (subtitle.includes(normalized)) score += 30
      if (keywords.includes(normalized)) score += 40

      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry)

  return scored
}
