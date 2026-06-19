'use client'

import type { PaymentIntentRecord } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">{label}</p>
      <p
        className={`mt-0.5 text-[13px] text-[#0f172a] ${mono ? 'break-all font-mono text-[12px]' : ''}`}
        title={value}
      >
        {value || '—'}
      </p>
    </div>
  )
}

function formatIso(iso: string | undefined): string {
  const s = apiTrimmedString(iso)
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Expandable intent-engine row — all values from API payload, no hard-coded demo rows. */
export function IntentEngineDetailPanel({ intent }: { intent: PaymentIntentRecord }) {
  const gov = intent.governance
  const conf =
    typeof intent.aggregate_confidence_score === 'number' && Number.isFinite(intent.aggregate_confidence_score)
      ? intent.aggregate_confidence_score <= 1
        ? `${(intent.aggregate_confidence_score * 100).toFixed(1)}%`
        : `${intent.aggregate_confidence_score.toFixed(1)}%`
      : '—'

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <DetailField label="Intent ID" value={apiTrimmedString(intent.intent_id)} mono />
      <DetailField label="Tenant ID" value={apiTrimmedString(intent.tenant_id)} mono />
      <DetailField label="Envelope ID" value={apiTrimmedString(intent.envelope_id)} mono />
      <DetailField
        label="Amount"
        value={`${apiTrimmedString(intent.amount) || '—'} ${apiTrimmedString(intent.currency) || ''}`.trim()}
      />
      <DetailField label="Execution at" value={formatIso(intent.intended_execution_at)} />
      <DetailField
        label="Provider / rail"
        value={apiTrimmedString(intent.beneficiary_type) || apiTrimmedString(intent.beneficiary?.instrument?.kind)}
      />
      <DetailField label="Intent quality score" value={conf} />
      <DetailField label="Status" value={apiTrimmedString(intent.status)} />
      <DetailField label="Governance state" value={apiTrimmedString(intent.governance_state)} />
      <DetailField label="Business state" value={apiTrimmedString(intent.business_state)} />
      <DetailField label="Client payout ref" value={apiTrimmedString(intent.client_payout_ref)} mono />
      <DetailField label="Intent type" value={apiTrimmedString(intent.intent_type)} />
      <DetailField label="Execution window" value={apiTrimmedString(intent.constraints?.execution_window)} />
      <DetailField label="Created at" value={formatIso(intent.created_at)} />
      <DetailField label="Updated at" value={formatIso(intent.updated_at)} />
      <DetailField
        label="Duplicate risk"
        value={intent.duplicate_risk_flag === true ? 'Yes' : intent.duplicate_risk_flag === false ? 'No' : '—'}
      />
      {gov ? (
        <>
          <DetailField
            label="Semantic valid"
            value={gov.semantic_valid === true ? 'Yes' : gov.semantic_valid === false ? 'No' : '—'}
          />
          <DetailField
            label="Routing consistent"
            value={gov.routing_consistent === true ? 'Yes' : gov.routing_consistent === false ? 'No' : '—'}
          />
          <DetailField
            label="Execution window valid"
            value={gov.execution_window_valid === true ? 'Yes' : gov.execution_window_valid === false ? 'No' : '—'}
          />
          <DetailField label="Duplicate detected" value={gov.duplicate_detected === true ? 'Yes' : 'No'} />
        </>
      ) : null}
      <DetailField label="Contract ID" value={apiTrimmedString(intent.contract_id)} mono />
      <DetailField label="Request fingerprint" value={apiTrimmedString(intent.request_fingerprint)} mono />
    </div>
  )
}
