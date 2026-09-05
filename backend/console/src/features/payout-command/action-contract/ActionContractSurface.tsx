'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import {
  ACTION_CONTRACT_HEADER,
  DEMO_ACTION_CONTRACT_ID,
  getActionContractById,
  listActionContracts,
  primaryContractCtas,
  type PaymentActionContract,
  type TimelineEvent,
} from '@/services/payout-command/demo/actionContractDemo'
import { DEMO_PAYOUT_AMOUNTS } from '@/services/payout-command/demo/demoPayoutAmounts'
import { DEMO_SMOKE_BATCH_ID, withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { UndersettleNetPanel } from '../shared/UndersettleNetPanel'
import { getStoredScenario, SCENARIO_CROSS_BORDER } from '@/services/payout-command/demo/scenarioMode'

type TabId = 'overview' | 'policy' | 'timeline' | 'json' | 'versions'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'policy', label: 'Policy decision' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'json', label: 'JSON' },
  { id: 'versions', label: 'Versions' },
]

type Notice = { tone: 'ok' | 'warn' | 'err'; text: string }

export function ActionContractSurface({ contractId }: { contractId: string }) {
  const router = useRouter()
  // Upload-first: sealed PAC appears only after obligation + settlement files are uploaded.
  const { ready, readiness, require } = useDemoBatchReady(undefined, { require: 'intent' })
  const contract = useMemo(
    () => getActionContractById(contractId) ?? getActionContractById(DEMO_ACTION_CONTRACT_ID),
    [contractId],
  )
  const [tab, setTab] = useState<TabId>('overview')
  const [techOpen, setTechOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [amendConfirm, setAmendConfirm] = useState(false)

  if (!ready) {
    return (
      <div className="bg-[#F8FAFC] pb-10">
        <div className="mx-auto w-full max-w-[1280px] space-y-5">
          <PageExplainerBanner page="contract" />
          <header>
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.03em] text-[#0B1324]">
              {ACTION_CONTRACT_HEADER.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#64748B]">{ACTION_CONTRACT_HEADER.subtitle}</p>
          </header>
          <AwaitingUploadsEmptyState
            title="No Payment Action Contract yet"
            readiness={readiness}
            require={require}
          />
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[13px] text-[#64748B]">
        Contract not found.
      </div>
    )
  }

  // Narrowed for nested handlers (TS loses control-flow narrowing across early returns).
  const pac: PaymentActionContract = contract
  const ctas = primaryContractCtas(pac)
  const batchContracts = listActionContracts()
  const resolvedId = pac.id !== contractId.trim() && contractId.trim() !== ''

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(pac.integrity.contractHash)
      setNotice({ tone: 'ok', text: 'Contract hash copied.' })
    } catch {
      setNotice({ tone: 'err', text: 'Could not copy hash.' })
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(pac.jsonBody, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pac.id}-${pac.version}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'ok', text: 'JSON downloaded.' })
  }

  function onPrimary(id: string) {
    if (id === 'dispatch') {
      if (!ctas.primary.find((p) => p.id === 'dispatch')?.enabled) {
        setNotice({
          tone: 'warn',
          text:
            ctas.primary.find((p) => p.id === 'dispatch')?.reason ??
            'Dispatch not available in this state.',
        })
        return
      }
      router.push(`/execution/dispatches?demo=sandbox&contract=${encodeURIComponent(pac.id)}`)
      return
    }
    if (id === 'export') {
      if (!pac.sealed) {
        setNotice({ tone: 'warn', text: 'Export signed instruction requires a sealed contract.' })
        return
      }
      downloadJson()
      setNotice({
        tone: 'ok',
        text: 'Signed instruction export prepared (sandbox). Sealed hash included.',
      })
      return
    }
    if (id === 'amend') {
      setAmendConfirm(true)
    }
  }

  function confirmAmend() {
    setAmendConfirm(false)
    setNotice({
      tone: 'ok',
      text: 'Amendment draft created. Sealed v1 stays immutable. New draft requires fresh policy decision before seal.',
    })
    setTab('versions')
  }

  return (
    <div className="bg-[#F8FAFC] pb-10">
      {/* Persistent top strip */}
      <div className="shrink-0 border-b border-[#E5E5E5] bg-[#0B1324] px-5 py-3 text-white sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
          <StripChip label="Contract ID" value={contract.id} mono />
          <StripChip label="Version" value={contract.version} />
          <StripFlag ok={contract.sealed} label={contract.sealed ? 'Sealed' : 'Not sealed'} />
          <StripFlag ok={contract.policyPassed} label={contract.policyPassed ? 'Policy passed' : 'Policy not passed'} />
          <StripFlag
            ok={contract.signatureVerified}
            label={contract.signatureVerified ? 'Signature verified' : 'Unsigned'}
          />
          <StripChip label="Expiry" value={contract.expiryLabel} />
          <StripChip label="Lifecycle" value={contract.lifecycle} />
          <StripChip label="Batch" value={`${batchContracts.length} · ₹1,23,77,867.56`} />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-[#E5E5E5] bg-white lg:w-[240px] lg:border-b-0 lg:border-r">
          <div className="border-b border-[#E5E5E5] px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Batch contracts
            </p>
            <p className="mt-0.5 text-[12px] text-[#0B1324]">
              {batchContracts.length} sealed instructions · ₹1,23,77,867.56
            </p>
          </div>
          <ul className="max-h-[320px] space-y-0.5 overflow-y-auto px-1.5 py-1.5 lg:max-h-[calc(100vh-220px)]">
            {batchContracts.map((row) => {
              const active = row.id === pac.id
              return (
                <li key={row.id}>
                  <Link
                    href={withDemoBatchScope(`/contracts/${row.id}`)}
                    className={`block rounded-md border px-2.5 py-2 transition ${
                      active
                        ? 'border-[#0B1324] bg-[#F1F5F9]'
                        : 'border-transparent hover:border-[#E2E8F0] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-semibold text-[#0B1324]">{row.humanRef}</p>
                      {!row.sealed ? (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#C2413B]">
                          Blocked
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
                      {row.beneficiary.legalName}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold tabular-nums text-[#0B1324]">
                        {row.terms.amountLabel}
                      </span>
                      <span className="truncate text-[10px] font-semibold text-[#64748B]">
                        {row.lifecycle}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 px-5 py-5 sm:px-6 sm:py-6">
          <PageExplainerBanner page="contract" />
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="text-[12px] font-medium text-[#64748B]">{ACTION_CONTRACT_HEADER.conceptNote}</p>
              <h1 className="mt-1 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#0B1324]">
                {ACTION_CONTRACT_HEADER.title}
              </h1>
              <p className="mt-1 text-[13px] text-[#64748B]">{ACTION_CONTRACT_HEADER.subtitle}</p>
              <p className="mt-3 font-mono text-[13px] font-semibold text-[#0B1324]">
                {contract.humanRef}
                <span className="mx-2 font-sans font-normal text-[#E2E8F0]">·</span>
                <span className="font-sans font-normal text-[#64748B]">{contract.instructionRef}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Operating mode
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">{contract.operatingMode}</p>
              <p className="mt-1 text-[11px] text-[#94A3B8]">Sandbox-labelled actions</p>
            </div>
          </header>

          {resolvedId ? (
            <p className="mt-3 text-[12px] text-[#64748B]">
              Showing demo contract {contract.id}. Open{' '}
              <Link
                href={withDemoBatchScope(`/contracts/${DEMO_ACTION_CONTRACT_ID}`)}
                className="font-semibold text-[#2563EB]"
              >
                {DEMO_ACTION_CONTRACT_ID}
              </Link>{' '}
              for the primary sealed example.
            </p>
          ) : null}

          {/* Human summary - first */}
          <section className="mt-5 border border-[#E5E5E5] bg-white px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
              What this contract governs
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#0B1324]">{contract.plainSummary}</p>
            {contract.batchId === DEMO_SMOKE_BATCH_ID ? (
              <div className="mt-4 grid gap-3 border-t border-[#E5E5E5] pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium text-[#64748B]">This payout (sealed amount)</p>
                  <p className="mt-0.5 text-[1.125rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                    {contract.terms.amountLabel}
                    <span className="ml-1.5 text-[12px] font-medium text-[#64748B]">
                      {contract.terms.currency}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                    One obligation · {contract.humanRef} · not the batch total
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[#64748B]">Batch intended payment value</p>
                  <p className="mt-0.5 text-[1.125rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                    ₹1,23,77,867.56
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                    Across {DEMO_PAYOUT_AMOUNTS.length} payouts in {contract.batchId} · see Overview /
                    Intent Journal
                  </p>
                </div>
              </div>
            ) : null}
            <p className="mt-3 text-[12px] text-[#64748B]">
              {contract.sealed
                ? 'This sealed version is immutable. Material edits create a new draft and require re-evaluation.'
                : 'Draft is not immutable. Seal only after policy pass and valid authority / quote.'}
            </p>
          </section>

          {notice ? (
            <p
              role="status"
              className={`mt-4 border px-3 py-2.5 text-[13px] ${
                notice.tone === 'ok'
                  ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                  : notice.tone === 'err'
                    ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                    : 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
              }`}
            >
              {notice.text}
              <button
                type="button"
                className="ml-3 font-semibold underline"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </p>
          ) : null}

          {amendConfirm ? (
            <div className="mt-4 border border-[#E5E5E5] bg-white px-4 py-3">
              <p className="text-[13px] font-semibold text-[#0B1324]">Create amendment</p>
              <p className="mt-1 text-[12px] text-[#64748B]">
                Sealed {contract.version} stays unchanged. A new draft version will be created and must
                pass policy again before seal. Approval never silently rewrites the original intent.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmAmend}
                  className="h-9 bg-[#0B1324] px-3 text-[13px] font-semibold text-white"
                >
                  Confirm amendment draft
                </button>
                <button
                  type="button"
                  onClick={() => setAmendConfirm(false)}
                  className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {ctas.primary.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPrimary(a.id)}
                disabled={!a.enabled && a.id !== 'amend'}
                title={a.reason}
                className={`h-9 px-3.5 text-[13px] font-semibold ${
                  a.id === 'dispatch'
                    ? 'bg-[#2E5BFF] text-white hover:bg-[#2448D4] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]'
                    : a.id === 'amend'
                      ? 'border border-[#E5E5E5] bg-white text-[#0B1324] hover:bg-[#F8FAFC]'
                      : 'bg-[#0B1324] text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]'
                }`}
              >
                {a.label}
              </button>
            ))}
            <span className="mx-1 hidden h-5 w-px bg-[#E5E5E5] sm:inline-block" />
            {ctas.secondary.map((a) => {
              if (a.id === 'compare') {
                return (
                  <Link
                    key={a.id}
                    href={contract.links.sourceHref}
                    className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
                  >
                    {a.label}
                  </Link>
                )
              }
              if (a.id === 'policy') {
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setTab('policy')}
                    className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
                  >
                    {a.label}
                  </button>
                )
              }
              if (a.id === 'download_json') {
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={downloadJson}
                    className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
                  >
                    {a.label}
                  </button>
                )
              }
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={copyHash}
                  className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
                >
                  {a.label}
                </button>
              )
            })}
          </div>

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-1 border-b border-[#E5E5E5]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`h-10 px-3 text-[13px] font-semibold transition ${
                  tab === t.id
                    ? 'border-b-2 border-[#0B1324] text-[#0B1324]'
                    : 'text-[#64748B] hover:text-[#0B1324]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5 pb-10">
            {tab === 'overview' ? <OverviewTab contract={contract} /> : null}
            {tab === 'policy' ? <PolicyTab contract={contract} /> : null}
            {tab === 'timeline' ? <TimelineTab events={contract.timeline} /> : null}
            {tab === 'json' ? (
              <pre className="overflow-x-auto border border-[#E5E5E5] bg-[#0B1324] p-4 text-[12px] leading-relaxed text-[#E2E8F0]">
                {JSON.stringify(contract.jsonBody, null, 2)}
              </pre>
            ) : null}
            {tab === 'versions' ? <VersionsTab contract={contract} /> : null}
          </div>

          {/* Technical details disclosure */}
          <div className="mb-8 border border-[#E5E5E5] bg-white">
            <button
              type="button"
              onClick={() => setTechOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[13px] font-semibold text-[#0B1324]">Technical details</span>
              <span className="text-[12px] text-[#64748B]">{techOpen ? 'Hide' : 'Show'}</span>
            </button>
            {techOpen ? (
              <div className="space-y-2 border-t border-[#E5E5E5] px-4 py-3 font-mono text-[12px] text-[#334155]">
                <p>Hash: {contract.integrity.contractHash}</p>
                <p>Key ID: {contract.integrity.keyId}</p>
                <p>Canon: {contract.integrity.canonicalisationVersion}</p>
                <p>Signature: {contract.integrity.signature}</p>
                <p>Batch: {contract.batchId}</p>
                <p>Idempotency: {contract.execution.idempotencyKey}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function StripChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-white/50">{label}</span>
      <span className={`text-[12px] font-semibold text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </span>
  )
}

function StripFlag({ label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#0B1324] px-2.5 py-1 text-[11px] font-semibold text-white">
      {label}
    </span>
  )
}

function OverviewTab({ contract }: { contract: PaymentActionContract }) {
  const showUndersettle =
    getStoredScenario() === SCENARIO_CROSS_BORDER && Boolean(contract.undersettle)
  return (
    <div className="space-y-4">
      <Section title="Obligation">
        <Field label="Business reason" value={contract.obligation.businessReason} />
        <Field label="Source ref" value={contract.obligation.sourceRef} />
        <Field label="Invoice / contract" value={contract.obligation.invoiceOrContract} />
        <Field label="Payer entity" value={contract.obligation.payerEntity} />
      </Section>
      <Section title="Authority">
        <Field label="Initiator" value={contract.authority.initiator} />
        <Field label="Approvers" value={contract.authority.approvers.join(', ')} />
        <Field label="Approval time" value={contract.authority.approvalTime} />
        <Field label="Policy version" value={contract.authority.policyVersion} />
      </Section>
      <Section title="Beneficiary">
        <Field label="Legal name" value={contract.beneficiary.legalName} />
        <Field label="Masked account / wallet" value={contract.beneficiary.maskedAccount} />
        <Field label="Beneficiary version" value={contract.beneficiary.beneficiaryVersion} />
        <Field label="Validation state" value={contract.beneficiary.validationState} />
      </Section>
      <Section title="Commercial terms">
        {showUndersettle && contract.undersettle ? (
          <div className="col-span-full px-4 py-3">
            <UndersettleNetPanel breakdown={contract.undersettle} mode="contract" />
          </div>
        ) : null}
        <Field label={showUndersettle ? 'Invoice amount' : 'Amount'} value={contract.terms.amountLabel} />
        <Field label="Currency" value={contract.terms.currency} />
        <Field label="Discounts" value={contract.terms.discountsLabel} />
        <Field label="Fees" value={contract.terms.feesLabel} />
        <Field
          label={showUndersettle ? 'Tax line' : 'Taxes'}
          value={showUndersettle ? contract.terms.taxesLabel : 'Included in invoice'}
        />
        <Field
          label={showUndersettle ? 'Margin cut' : 'Deductions'}
          value={showUndersettle ? contract.terms.deductionsLabel : '₹0'}
        />
        <Field
          label={showUndersettle ? 'Expected net (sealed)' : 'Net amount'}
          value={showUndersettle ? contract.terms.netAmountLabel : contract.terms.amountLabel}
          emphasize
        />
      </Section>
      <Section title="Execution envelope">
        <Field label="Allowed rail" value={contract.execution.allowedRail} />
        <Field label="Provider" value={contract.execution.provider} />
        <Field label="Schedule" value={contract.execution.schedule} />
        <Field label="SLA" value={contract.execution.sla} />
        <Field label="Retry rules" value={contract.execution.retryRules} />
        <Field label="Idempotency key" value={contract.execution.idempotencyKey} mono />
        <Field label="Fallback constraints" value={contract.execution.fallbackConstraints} />
      </Section>
      <Section title="Outcome requirements">
        <Field label="Expected credited amount" value={contract.outcomeRequirements.expectedCreditedLabel} />
        <Field label="Tolerance" value={contract.outcomeRequirements.tolerance} />
        <Field label="Settlement deadline" value={contract.outcomeRequirements.settlementDeadline} />
        <Field
          label="Required signals"
          value={contract.outcomeRequirements.requiredSignals.join(' · ')}
        />
      </Section>
      {contract.crossBorder ? (
        <Section title="Cross-border constraints">
          <p className="col-span-full mb-2 border-l-4 border-[#0B1324] bg-[#F1F5F9] px-3 py-2 text-[12px] text-[#0B1324]">
            {contract.crossBorder.honestNote}
          </p>
          <Field label="Quote provider" value={contract.crossBorder.quoteProvider} />
          <Field label="Quote ID" value={contract.crossBorder.quoteId} />
          <Field label="Rate" value={contract.crossBorder.rate} />
          <Field label="Maximum spread" value={contract.crossBorder.maximumSpread} />
          <Field label="Fee cap" value={contract.crossBorder.feeCap} />
          <Field label="Settlement currency" value={contract.crossBorder.settlementCurrency} />
          <Field label="Quote expiry" value={contract.crossBorder.quoteExpiry} />
        </Section>
      ) : null}
      <Section title="Integrity">
        <Field label="Canonicalisation version" value={contract.integrity.canonicalisationVersion} />
        <Field label="Contract hash" value={contract.integrity.contractHash} mono />
        <Field label="Signature" value={contract.integrity.signature} mono />
        <Field label="Key ID" value={contract.integrity.keyId} mono />
        <Field label="Sealed at" value={contract.integrity.sealedAt} />
      </Section>
      <section className="border border-[#E5E5E5] bg-white">
        <div className="border-b border-[#E5E5E5] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[#0B1324]">Version history</h2>
        </div>
        <ul className="divide-y divide-[#F1F5F9]">
          {contract.versions.map((v) => (
            <li key={v.id} className="px-4 py-3">
              <p className="text-[13px] font-semibold text-[#0B1324]">
                {v.version} · {v.status}
              </p>
              <p className="mt-0.5 text-[12px] text-[#64748B]">
                {v.sealedAt ?? 'Not sealed'} · {v.actor}
              </p>
              <p className="mt-0.5 text-[13px] text-[#334155]">{v.note}</p>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-[12px] text-[#94A3B8]">
        Related:{' '}
        <Link href={contract.links.intentHref} className="font-semibold text-[#2563EB] hover:underline">
          Intent Journal
        </Link>
        {' · '}
        <Link href={contract.links.policyHref} className="font-semibold text-[#2563EB] hover:underline">
          Policy Studio
        </Link>
        {' · '}
        <Link href={contract.links.reviewHref} className="font-semibold text-[#2563EB] hover:underline">
          Control Review
        </Link>
      </p>
    </div>
  )
}

function PolicyTab({ contract }: { contract: PaymentActionContract }) {
  return (
    <div className="space-y-4">
      <div className="border border-[#E5E5E5] bg-white px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
          Decision
        </p>
        <p
          className={`mt-1 text-[1.25rem] font-semibold ${
            contract.policyDecision.decision === 'Pass'
              ? 'text-[#0B1324]'
              : contract.policyDecision.decision === 'Block'
                ? 'text-[#0B1324]'
                : 'text-[#0B1324]'
          }`}
        >
          {contract.policyDecision.decision}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[#0B1324]">
          {contract.policyDecision.summary}
        </p>
        <p className="mt-2 text-[12px] text-[#64748B]">
          Decision ID {contract.authority.policyDecisionId} · {contract.authority.policyVersion}
        </p>
      </div>
      <div className="border border-[#E5E5E5] bg-white">
        <div className="border-b border-[#E5E5E5] px-4 py-3 text-[13px] font-semibold text-[#0B1324]">
          Rules applied
        </div>
        <ul className="divide-y divide-[#E5E5E5]">
          {contract.policyDecision.rulesApplied.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <div>
                <p className="font-medium text-[#0B1324]">{r.name}</p>
                <p className="font-mono text-[11px] text-[#94A3B8]">{r.id}</p>
              </div>
              <span className="text-[12px] font-semibold text-[#64748B]">{r.effect}</span>
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={contract.links.policyHref}
        className="inline-flex text-[13px] font-semibold text-[#2563EB] hover:underline"
      >
        Open policy rule →
      </Link>
    </div>
  )
}

function TimelineTab({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-0 border border-[#E5E5E5] bg-white">
      {events.map((e, i) => (
        <li key={`${e.at}-${e.title}`} className="flex gap-4 border-b border-[#E5E5E5] px-4 py-4 last:border-0">
          <div className="flex w-4 flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#2E5BFF]" />
            {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-[#E2E8F0]" /> : null}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] font-medium text-[#94A3B8]">{e.at}</p>
            <p className="mt-0.5 text-[14px] font-semibold text-[#0B1324]">{e.title}</p>
            <p className="mt-0.5 text-[13px] text-[#64748B]">{e.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function VersionsTab({ contract }: { contract: PaymentActionContract }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#64748B]">
        A sealed version is immutable. Material edits create a new draft version and require
        re-evaluation - the original signed instruction is never silently rewritten.
      </p>
      <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] bg-white">
        {contract.versions.map((v) => (
          <li key={v.id} className="px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[13px] font-semibold text-[#0B1324]">{v.id}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  v.status === 'sealed'
                    ? 'bg-[#F1F5F9] text-[#0B1324]'
                    : v.status === 'draft'
                      ? 'bg-[#F1F5F9] text-[#0B1324]'
                      : 'bg-[#F1F5F9] text-[#64748B]'
                }`}
              >
                {v.status}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#64748B]">
              {v.version} · {v.sealedAt ?? 'Not sealed'} · {v.actor}
            </p>
            <p className="mt-1 text-[13px] text-[#334155]">{v.note}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-[#E5E5E5] bg-white">
      <div className="border-b border-[#E5E5E5] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[#0B1324]">{title}</h2>
      </div>
      <div className="grid gap-0 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string
  value: string
  mono?: boolean
  emphasize?: boolean
}) {
  return (
    <div className="border-b border-[#F1F5F9] px-4 py-3 sm:odd:border-r sm:odd:border-[#F1F5F9]">
      <p className="text-[11px] font-medium text-[#64748B]">{label}</p>
      <p
        className={`mt-0.5 text-[13px] text-[#0B1324] ${mono ? 'break-all font-mono text-[12px]' : ''} ${
          emphasize ? 'font-semibold' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}
