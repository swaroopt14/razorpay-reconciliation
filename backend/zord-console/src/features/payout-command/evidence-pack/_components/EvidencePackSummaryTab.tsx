'use client'

import { useEffect, useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { mapProofCoverageFromPack } from '../../evidence/mappers/mapProofCoverage'
import { mapProofStatusFromPack } from '../../evidence/mappers/mapProofStatus'
import { VerifyProofIntegrityButton } from './VerifyProofIntegrityButton'
import { MissingProofChecklist } from './MissingProofChecklist'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { ProofCoverageTile } from '../../evidence/types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../../evidence/types/evidenceViewModels'
import { getIntentJournalPaymentIntentsForSession } from '@/services/payout-command/prod-api/intentJournalApi'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

type EvidencePackSummaryTabProps = {
  pack: EvidencePackFull | null
  batchId: string
  loading: boolean
}

function cleanDisplay(value: unknown): string | null {
  const out = apiTrimmedString(value)
  if (!out) return null
  const normalized = out.toLowerCase()
  if (normalized === 'null' || normalized === 'undefined' || normalized === '-') return null
  return out
}

function formatCurrencyLabel(value: number): string {
  return `Rs ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function parseNumeric(value: unknown): number | null {
  if (value == null || value === '') return null
  const normalized = String(value).replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCount(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round(parsed))
}

function resolvePackAmount(pack: EvidencePackFull | null): string | null {
  if (!pack) return null
  const minorNum = parseNumeric(pack.amount_minor)
  if (minorNum != null) return formatCurrencyLabel(minorNum / 100)
  const amountNum = parseNumeric(pack.amount)
  if (amountNum != null) return formatCurrencyLabel(amountNum)
  return null
}

function resolvePaymentRef(pack: EvidencePackFull): string {
  return (
    cleanDisplay(pack.client_payout_ref) ||
    cleanDisplay(pack.client_reference) ||
    cleanDisplay(pack.intent_id) ||
    cleanDisplay(pack.evidence_pack_id) ||
    '-'
  )
}

function coverageOk(status: ProofCoverageTile['status']): boolean {
  return status === 'available' || status === 'generated'
}

export function EvidencePackSummaryTab({ pack, batchId, loading }: EvidencePackSummaryTabProps) {
  const [amountFromIntent, setAmountFromIntent] = useState<string | null>(null)

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    const iid = apiTrimmedString(pack?.intent_id)
    if (!bid || !iid) {
      setAmountFromIntent(null)
      return
    }

    let cancelled = false
    void getIntentJournalPaymentIntentsForSession(bid).then((res) => {
      if (cancelled) return
      const intent = res.data?.items?.find((row) => apiTrimmedString(row.intent_id) === iid)
      const parsed = parseNumeric(intent?.amount)
      setAmountFromIntent(parsed == null ? null : formatCurrencyLabel(parsed))
    })

    return () => {
      cancelled = true
    }
  }, [batchId, pack?.intent_id])

  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading evidence pack…</p>
  if (!pack) {
    return (
      <div>
        <p className="text-[16px] font-semibold text-[#111111]">{evidenceCopy.empty.noPack}</p>
        <p className="mt-2 text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
      </div>
    )
  }

  const status = mapProofStatusFromPack(
    {
      evidence_pack_id: pack.evidence_pack_id,
      tenant_id: pack.tenant_id,
      intent_id: pack.intent_id,
      contract_id: pack.contract_id,
      mode: pack.mode,
      pack_status: pack.pack_status,
      merkle_root: pack.merkle_root,
      ruleset_version: pack.ruleset_version,
      created_at: pack.created_at,
      proof_status: pack.proof_status,
      proof_score: pack.proof_score,
      leaf_count: pack.leaf_count,
      required_leaf_count: pack.required_leaf_count,
      artifact_count: pack.items?.length,
      verification_status: pack.verification_status,
      settlement_leaf_present_flag: pack.settlement_leaf_present_flag,
      attachment_decision_leaf_present_flag: pack.attachment_decision_leaf_present_flag,
      proof_components: pack.proof_components,
    },
    pack.leaf_count ?? pack.items?.length,
  )

  const coverage = mapProofCoverageFromPack(pack)
  const paymentRef = resolvePaymentRef(pack)
  const amountLabel = resolvePackAmount(pack) ?? amountFromIntent
  const confidence = pack.match_confidence != null && Number.isFinite(pack.match_confidence) ? pack.match_confidence : null
  const governanceLabel = cleanDisplay(pack.governance_decision) ?? '-'
  const attachmentLabel = cleanDisplay(pack.attachment_decision) ?? '-'
  const bankRefLabel = cleanDisplay(pack.bank_reference)
  const amountMatch =
    typeof pack.amount_match === 'boolean' ? pack.amount_match : null
  const valueDateOk =
    typeof pack.value_date_check === 'boolean' ? pack.value_date_check : null

  const leafSeen = parseCount(pack.leaf_count) ?? parseCount(pack.items?.length)
  const requiredLeaves = parseCount(pack.required_leaf_count)
  const leafTotal =
    leafSeen != null && requiredLeaves != null
      ? Math.max(leafSeen, requiredLeaves)
      : requiredLeaves ?? leafSeen ?? EXPECTED_PROOF_ITEMS
  const leafDisplay = leafSeen ?? 0
  const coverageReady = coverage.filter((t) => coverageOk(t.status)).length
  const isPartial = status.label.toLowerCase().includes('partial')

  const checks = [
    {
      id: 'amount',
      label: 'Amount check',
      pass: amountMatch,
      detail:
        amountMatch == null
          ? 'Not evaluated'
          : amountMatch
            ? 'Settled amount matches intent'
            : 'Amount mismatch detected',
    },
    {
      id: 'value-date',
      label: 'Value-date check',
      pass: valueDateOk,
      detail:
        valueDateOk == null
          ? 'Not evaluated'
          : valueDateOk
            ? 'Value date within policy window'
            : 'Value date outside policy',
    },
    {
      id: 'governance',
      label: 'Governance',
      pass: governanceLabel.toLowerCase() === 'pass',
      detail: governanceLabel,
    },
    {
      id: 'attachment',
      label: 'Attachment',
      pass:
        attachmentLabel.toLowerCase().includes('attach') &&
        !attachmentLabel.toLowerCase().includes('pending'),
      detail: attachmentLabel,
    },
    {
      id: 'bank',
      label: 'Bank reference',
      pass: Boolean(bankRefLabel),
      detail: bankRefLabel ?? 'Awaiting UTR / settlement ref',
    },
  ]

  const decisionSteps = [
    { label: 'Governance', value: governanceLabel, done: governanceLabel.toLowerCase() === 'pass' || governanceLabel.toLowerCase() === 'review' },
    { label: 'Attachment', value: attachmentLabel, done: Boolean(cleanDisplay(attachmentLabel)) },
    { label: 'Bank ref', value: bankRefLabel ?? 'Pending', done: Boolean(bankRefLabel) },
    { label: 'Pack status', value: pack.pack_status, done: pack.pack_status?.toUpperCase() === 'READY' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero strip */}
      <section className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-[#fafafa]">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#888888]">Payment proof</p>
            <p className="mt-1 truncate font-mono text-[18px] font-semibold tracking-tight text-[#111111] sm:text-[22px]">
              {paymentRef}
            </p>
            <p className="mt-1 truncate font-mono text-[12px] text-[#888888]" title={pack.evidence_pack_id}>
              {pack.evidence_pack_id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {amountLabel ? (
              <div className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888888]">Amount</p>
                <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-[#111111]">{amountLabel}</p>
              </div>
            ) : null}
            <div
              className={`rounded-xl border px-4 py-2.5 ${
                isPartial
                  ? 'border-[#e8e0d0] bg-[#fbf7f0] text-[#7a5c2e]'
                  : 'border-[#dce6df] bg-[#f4f7f5] text-[#2f4a3a]'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Proof status</p>
              <p className="mt-0.5 text-[16px] font-semibold">{status.label}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-[#E5E5E5] bg-white text-center">
          <HeroStat label="Leaves" value={`${leafDisplay}/${leafTotal}`} />
          <HeroStat label="Coverage" value={`${coverageReady}/${coverage.length}`} />
          <HeroStat label="Beneficiary" value="Masked" />
        </div>
      </section>

      {/* Confidence + decision pipeline */}
      <section className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ConfidenceMeter confidence={confidence} />
        <DecisionPipeline steps={decisionSteps} />
      </section>

      {/* Check rail */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#111111]">Integrity checks</p>
            <p className="mt-0.5 text-[12px] text-[#666666]">Pass / fail signals for this payment proof</p>
          </div>
          <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[#333333]">
            {checks.filter((c) => c.pass).length}/{checks.length} passed
          </span>
        </div>
        <ul className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white">
          {checks.map((check) => (
            <li
              key={check.id}
              className="flex items-start gap-3 border-b border-[#F0F0F0] px-4 py-3.5 last:border-b-0"
            >
              <CheckMark pass={check.pass} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#111111]">{check.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      check.pass == null
                        ? 'bg-[#f4f4f5] text-[#666666]'
                        : check.pass
                          ? 'bg-[#f4f7f5] text-[#2f4a3a]'
                          : 'bg-[#fbf7f0] text-[#7a5c2e]'
                    }`}
                  >
                    {check.pass == null ? 'Pending' : check.pass ? 'Pass' : 'Fail'}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#666666]">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Proof chain */}
      <ProofChainRail tiles={coverage} />

      {/* IDs as compact definition list */}
      <section className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white">
        <div className="border-b border-[#E5E5E5] bg-[#fafafa] px-4 py-3">
          <p className="text-[15px] font-semibold text-[#111111]">References</p>
        </div>
        <dl>
          <RefRow label="Payment ref" value={paymentRef} mono />
          <RefRow label="Intent id" value={apiTrimmedString(pack.intent_id) || '-'} mono />
          <RefRow label="Pack id" value={pack.evidence_pack_id} mono />
          <RefRow label="Contract" value={apiTrimmedString(pack.contract_id) || '-'} mono />
          <RefRow label="Mode" value={apiTrimmedString(pack.mode).replace(/_/g, ' ') || '-'} />
          <RefRow label="Bank reference" value={bankRefLabel ?? 'Pending'} mono last />
        </dl>
      </section>

      <MissingProofChecklist pack={pack} />
      <VerifyProofIntegrityButton pack={pack} />
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888888]">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#111111]">{value}</p>
    </div>
  )
}

function ConfidenceMeter({ confidence }: { confidence: number | null }) {
  const pct = confidence == null ? 0 : Math.round(confidence * 100)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E5E5E5] bg-white px-4 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#888888]">Match confidence</p>
      <div className="relative mt-3 h-[140px] w-[140px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#ececec" strokeWidth="10" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#555555"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={confidence == null ? circumference : offset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[28px] font-semibold tabular-nums leading-none text-[#111111]">
            {confidence == null ? '-' : `${pct}%`}
          </p>
          <p className="mt-1 text-[11px] font-medium text-[#888888]">reconcile match</p>
        </div>
      </div>
    </div>
  )
}

function DecisionPipeline({
  steps,
}: {
  steps: Array<{ label: string; value: string; done: boolean }>
}) {
  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-white px-4 py-4 sm:px-5">
      <p className="text-[15px] font-semibold text-[#111111]">Decision path</p>
      <p className="mt-0.5 text-[12px] text-[#666666]">How this payment moved from policy to pack</p>
      <ol className="mt-5 space-y-0">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
              {!last ? (
                <span
                  className={`absolute left-[9px] top-5 h-[calc(100%-8px)] w-px ${
                    step.done ? 'bg-[#cfcfcf]' : 'bg-[#EFEFEF]'
                  }`}
                  aria-hidden
                />
              ) : null}
              <span
                className={`relative z-[1] mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  step.done
                    ? 'border-[#555555] bg-[#555555] text-white'
                    : 'border-[#d4d4d8] bg-white text-[#aaaaaa]'
                }`}
              >
                {step.done ? '✓' : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#888888]">{step.label}</p>
                <p className="mt-0.5 text-[14px] font-semibold text-[#111111]">{step.value}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function CheckMark({ pass }: { pass: boolean | null }) {
  if (pass == null) {
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#d4d4d8] bg-[#fafafa] text-[11px] font-bold text-[#888888]">
        ·
      </span>
    )
  }
  if (pass) {
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3d5a48] text-[11px] font-bold text-white">
        ✓
      </span>
    )
  }
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#b08948] text-[11px] font-bold text-white">
      !
    </span>
  )
}

function ProofChainRail({ tiles }: { tiles: ProofCoverageTile[] }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-[#111111]">{evidenceCopy.coverage.title}</p>
          <p className="mt-0.5 text-[12px] text-[#666666]">Evidence chain for this payment</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-0">
        {tiles.map((tile, index) => {
          const ok = coverageOk(tile.status)
          const label =
            tile.status === 'available'
              ? evidenceCopy.coverage.available
              : tile.status === 'generated'
                ? evidenceCopy.coverage.generated
                : tile.status === 'missing'
                  ? evidenceCopy.coverage.missing
                  : evidenceCopy.coverage.notGenerated
          return (
            <div key={tile.id} className="relative flex min-w-0 flex-1">
              {index > 0 ? (
                <div
                  className={`absolute left-0 top-5 hidden h-px w-3 -translate-x-full sm:block ${
                    ok ? 'bg-[#cfcfcf]' : 'bg-[#E5E5E5]'
                  }`}
                  aria-hidden
                />
              ) : null}
              <div
                className={`w-full rounded-lg border px-3 py-2.5 sm:mx-1 ${
                  ok ? 'border-[#E5E5E5] bg-[#fafafa]' : 'border-[#e8e0d0] bg-[#fbf7f0]'
                }`}
              >
                <div className="flex items-center gap-2 sm:flex-col sm:items-start">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      ok ? 'bg-[#555555] text-white' : 'bg-[#b08948] text-white'
                    }`}
                  >
                    {ok ? '✓' : '!'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase leading-snug tracking-[0.06em] text-[#888888]">
                      {tile.label}
                    </p>
                    <p className={`mt-0.5 text-[13px] font-semibold ${ok ? 'text-[#111111]' : 'text-[#7a5c2e]'}`}>
                      {label}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RefRow({
  label,
  value,
  mono,
  last,
}: {
  label: string
  value: string
  mono?: boolean
  last?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-3 odd:bg-[#fafafa] ${
        last ? '' : 'border-b border-[#F0F0F0]'
      }`}
    >
      <dt className="text-[12px] font-semibold text-[#888888]">{label}</dt>
      <dd className={`min-w-0 truncate text-[13px] font-semibold text-[#111111] ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  )
}
