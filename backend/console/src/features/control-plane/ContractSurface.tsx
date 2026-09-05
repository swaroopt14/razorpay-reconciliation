'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchContract, verifyPac } from '@/services/protocol/controlPlaneClient'
import {
  CROSS_BORDER_PAC_ID,
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import type { ProtocolObject, ProtocolVerifyResult } from '@/types/protocol'
import {
  ControlPlaneHeader,
  CopyChip,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
} from './ProtocolChrome'
import { ActionTraceSidebar } from './ActionTraceSidebar'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { FlowCompletionPopup } from './FlowCompletionPopup'
import { WorkflowStepper, WorkflowNavButtons } from './WorkflowStepper'
import { undersettleBreakdownForPayee } from '@/services/payout-command/demo/undersettleScheduleDemo'
import { UndersettleNetPanel } from '@/features/payout-command/shared/UndersettleNetPanel'

type ContractPayload = ProtocolObject & {
  demo?: {
    trace_id: string
    pac_id: string
    human_ref: string
    beneficiary: string
    debtor: string
    amount_minor: number
    amount_display: string
    currency: string
    rail: string
  }
  batch_totals?: {
    intent_count: number
    intended_display: string
  }
}

function formatInrFromMinor(minor: number) {
  return (minor / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  })
}

export function ContractSurface({ traceId }: { traceId: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <ContractSurfaceBody traceId={traceId} />
    </UploadGate>
  )
}

function ContractSurfaceBody({ traceId }: { traceId: string }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const { data, error, loading } = useProtocolQuery(`pac:${activeTrace}`, () =>
    fetchContract(activeTrace),
  )
  const [verify, setVerify] = useState<{
    result: ProtocolVerifyResult
    stored_digest?: string
    computed_digest?: string
    error?: string
  } | null>(null)
  const [contractPopupOpen, setContractPopupOpen] = useState(false)
  const [contractPopupShown, setContractPopupShown] = useState(false)
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)
  const pac = data as ContractPayload | null

  // Show popup once PAC loads
  useEffect(() => {
    if (pac && !contractPopupShown) {
      const t = window.setTimeout(() => {
        setContractPopupOpen(true)
        setContractPopupShown(true)
      }, 2000)
      return () => window.clearTimeout(t)
    }
  }, [pac, contractPopupShown])
  const demo = pac?.demo
  const action = pac?.action as
    | { beneficiary_ref?: string; amount_minor?: number; currency?: string; debtor_ref?: string }
    | undefined
  const amountLabel =
    demo?.amount_display ??
    (action?.amount_minor != null ? formatInrFromMinor(action.amount_minor) : '—')
  const beneficiary = demo?.beneficiary || action?.beneficiary_ref || '—'
  const debtor = demo?.debtor || action?.debtor_ref || 'Zordnet Operations'
  const humanRef = demo?.human_ref || '—'
  const pacId = String(pac?.pac_id ?? demo?.pac_id ?? CROSS_BORDER_PAC_ID)
  const contractBreakdown = undersettleBreakdownForPayee(
    beneficiary,
    action?.amount_minor != null ? action.amount_minor / 100 : undefined,
  )

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <WorkflowStepper
        activeStep="contract"
        traceId={activeTrace}
        context={demo ? {
          batch: 'Batch 001',
          action: humanRef,
          beneficiary,
          amount: amountLabel,
          rail: demo.rail,
        } : undefined}
      />
      <ControlPlaneHeader
        title="Payment Action Contract"
        subtitle="The immutable dispatch boundary for each Batch 001 payout. Banks still move the funds. Zord binds who authorized the action and what may leave."
        chips={
          <>
            <EvidenceChip kind="deterministic">Human approved</EvidenceChip>
            <EvidenceChip kind="verified">JWS ES256</EvidenceChip>
            <EvidenceChip kind="deterministic">
              {`${pac?.batch_totals?.intent_count ?? 100} · ${pac?.batch_totals?.intended_display ?? '₹1,23,77,867.56'}`}
            </EvidenceChip>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ActionTraceSidebar activeTraceId={activeTrace} mode="contract" />
        <div className="min-w-0 flex-1">
          <PageState loading={loading} error={error}>
            {pac ? (
              <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-4">
                  <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Sealed obligation · {humanRef}
                    </p>
                    <p className="mt-2 text-[15px] font-semibold text-[#0B1324]">
                      Pay {amountLabel} to {beneficiary} against {humanRef} / Batch 001.
                    </p>
                    <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
                      <div>
                        <dt className="text-[#64748B]">Principal</dt>
                        <dd className="font-medium">{debtor}</dd>
                      </div>
                      <div>
                        <dt className="text-[#64748B]">Beneficiary</dt>
                        <dd className="font-medium">{beneficiary}</dd>
                      </div>
                      <div>
                        <dt className="text-[#64748B]">Amount</dt>
                        <dd className="font-medium tabular-nums">{amountLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[#64748B]">Rail</dt>
                        <dd className="font-medium">{demo?.rail || 'From attached policy'}</dd>
                      </div>
                      <div>
                        <dt className="text-[#64748B]">Actor</dt>
                        <dd className="font-medium">
                          {String((pac.actor as { agent_id?: string } | undefined)?.agent_id)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#64748B]">Policy</dt>
                        <dd className="font-medium">
                          {String((pac.authority as { policy_id?: string } | undefined)?.policy_id)}{' '}
                          {(pac.authority as { policy_version?: string } | undefined)?.policy_version}
                        </dd>
                      </div>
                    </dl>
                    {contractBreakdown ? (
                      <div className="mt-4">
                        <UndersettleNetPanel breakdown={contractBreakdown} mode="contract" />
                      </div>
                    ) : null}
                    {(pac.execution_constraints as { notes?: string; policy_draft_ref?: string } | undefined)
                      ?.notes ||
                    (pac.business_context as { policy_studio_note?: string } | undefined)
                      ?.policy_studio_note ? (
                      <div className="mt-4 rounded-md border border-l-4 border-[#D8DEE9] border-l-[#2E5BFF] bg-[#F7F8FB] px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                          Policy draft ref on PAC
                        </p>
                        <p className="mt-1 text-[13px] text-[#0B1324]">
                          {String(
                            (pac.execution_constraints as { notes?: string } | undefined)?.notes ??
                              (pac.business_context as { policy_studio_note?: string })
                                .policy_studio_note,
                          )}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                          {String(
                            (pac.execution_constraints as { policy_draft_ref?: string } | undefined)
                              ?.policy_draft_ref ??
                              (pac.authority as { policy_draft_ref?: string } | undefined)
                                ?.policy_draft_ref ??
                              '',
                          )}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <CopyChip label="PAC" value={pacId} />
                      <CopyChip label="Trace" value={String(pac.trace_id ?? activeTrace)} />
                      <CopyChip label="Digest" value={String(pac.digest ?? '')} />
                      <CopyChip label="Key" value={String(pac.signature?.kid ?? '')} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-md bg-[#0B1324] px-4 text-[13px] font-semibold text-white"
                        onClick={async () => {
                          try {
                            const result = await verifyPac(pacId)
                            setVerify(result)
                          } catch (err) {
                            setVerify({
                              result: 'INVALID',
                              error: err instanceof Error ? err.message : 'verify_failed',
                            })
                          }
                        }}
                      >
                        Verify signature
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-md border border-[#C2413B] px-4 text-[13px] font-semibold text-[#C2413B]"
                        onClick={async () => {
                          try {
                            const base = Number(action?.amount_minor ?? demo?.amount_minor ?? 550_000)
                            const result = await verifyPac(pacId, {
                              tamper_amount_minor: base + 1,
                            })
                            setVerify(result)
                          } catch (err) {
                            setVerify({
                              result: 'INVALID',
                              error: err instanceof Error ? err.message : 'verify_failed',
                            })
                          }
                        }}
                      >
                        Tamper amount +₹0.01
                      </button>
                      <Link
                        href={href(`/actions/${activeTrace}/dispatch`)}
                        className="inline-flex h-10 items-center rounded-md border border-[#D8DEE9] px-4 text-[13px] font-semibold text-[#0B1324]"
                      >
                        Dispatch Control
                      </Link>
                    </div>
                    {verify ? (
                      <p
                        className={`mt-3 text-[13px] font-semibold ${
                          verify.result === 'VALID' ? 'text-[#138A63]' : 'text-[#C2413B]'
                        }`}
                      >
                        {verify.result}
                        {verify.error ? ` · ${verify.error}` : ''}
                      </p>
                    ) : null}
                  </section>
                  <ProtocolJsonPanel object={pac} title="PaymentActionContract" />
                </div>
                <aside className="space-y-3">
                  <div className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Batch portfolio
                    </p>
                    <p className="mt-1 text-[16px] font-semibold text-[#0B1324]">
                      {pac.batch_totals?.intended_display ?? '₹1,23,77,867.56'}
                    </p>
                    <p className="text-[12px] text-[#64748B]">
                      {pac.batch_totals?.intent_count ?? 20} sealed contracts in Batch 001
                    </p>
                  </div>
                  <p className="text-[12px] text-[#64748B]">
                    Canonical bytes use RFC 8785. The digest on every downstream page is this stored
                    digest — never recomputed from a UI view model.
                  </p>
                  <EvidenceChip kind="agent">AI drafted policy</EvidenceChip>
                  <EvidenceChip kind="deterministic">Deterministic kernel allowed</EvidenceChip>
                </aside>
              </div>
            ) : null}
          </PageState>
        </div>
      </div>

      <WorkflowNavButtons
        backLabel="Authority"
        backHref={href(`/actions/${activeTrace}/authority`)}
        nextLabel="Dispatch Control"
        nextHref={href(`/actions/${activeTrace}/dispatch`)}
      />
      <FlowCompletionPopup
        open={contractPopupOpen}
        onClose={() => setContractPopupOpen(false)}
        title="Payment Action Contract signed"
        description="PAC sealed with authority, policy decision, and source evidence hashes. Digest is immutable across all downstream pages."
        nextLabel="Dispatch"
        nextHref={href(`/actions/${activeTrace}/dispatch`)}
        traceId={activeTrace}
      />
    </div>
  )
}
