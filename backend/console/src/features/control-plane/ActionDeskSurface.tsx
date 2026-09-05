'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { fetchActionDesk } from '@/services/protocol/controlPlaneClient'
import {
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import {
  ControlPlaneHeader,
  CopyChip,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
} from './ProtocolChrome'
import { BoundStructurePanel } from './BoundStructurePanel'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { FlowCompletionPopup } from './FlowCompletionPopup'
import { WorkflowStepper, WorkflowNavButtons } from './WorkflowStepper'

function formatInrFromMinor(minor: number) {
  return (minor / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  })
}

export function ActionDeskSurface({ traceId }: { traceId?: string } = {}) {
  return (
    <UploadGate title="No payment obligations yet">
      <ActionDeskBody traceId={traceId} />
    </UploadGate>
  )
}

function ActionDeskBody({ traceId }: { traceId?: string }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const { data, error, loading } = useProtocolQuery('action-desk', fetchActionDesk)
  const proposal = data?.proposal
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [proposalPopupOpen, setProposalPopupOpen] = useState(false)
  const [proposalPopupShown, setProposalPopupShown] = useState(false)

  // Show popup once proposal loads
  useEffect(() => {
    if (data?.proposal && !proposalPopupShown) {
      const t = window.setTimeout(() => {
        setProposalPopupOpen(true)
        setProposalPopupShown(true)
      }, 2000)
      return () => window.clearTimeout(t)
    }
  }, [data?.proposal, proposalPopupShown])

  const instructions = useMemo(() => {
    if (data?.payment_instructions?.length) {
      return data.payment_instructions.map((row) => ({
        id: row.human_ref,
        amount_minor: row.amount_minor ?? Math.round((row.amount_rupees ?? 0) * 100),
        currency: row.currency || 'INR',
        vendor: row.beneficiary,
        trace_id: row.trace_id,
        intent_id: row.intent_id,
        rail: row.rail,
        current_state: row.current_state,
      }))
    }
    return data?.invoices ?? []
  }, [data])

  const active =
    instructions.find((row) => row.id === selectedRef) ??
    instructions[0] ??
    null

  const batchTotal =
    data?.batch?.intended_display ??
    (instructions.length
      ? formatInrFromMinor(instructions.reduce((s, r) => s + (r.amount_minor || 0), 0))
      : '—')

  return (
    <div className="bg-[#F7F8FB]">
      <WorkflowStepper
        activeStep="action"
        traceId={activeTrace}
        context={active ? {
          batch: data?.batch?.label || 'Batch 001',
          action: active.id,
          beneficiary: active.vendor,
          amount: formatInrFromMinor(active.amount_minor),
          rail: active.rail || undefined,
        } : undefined}
      />
      <ControlPlaneHeader
        title="Action Desk"
        subtitle="The Financial Action Agent converts Batch 001’s payout instructions into grounded proposals. Model output is not permission."
        chips={
          <>
            <EvidenceChip kind="agent">Agent proposed</EvidenceChip>
            <EvidenceChip kind="deterministic">
              {`${(data?.batch?.intent_count ?? instructions.length) || 20} instructions`}
            </EvidenceChip>
            <EvidenceChip kind="blocked">NOT AUTHORIZED</EvidenceChip>
          </>
        }
      />
      <PageState loading={loading} error={error}>
        {data ? (
          <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <section className="rounded-xl border border-[#D8DEE9] bg-white p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Batch instruction
                    </p>
                    <p className="mt-1 text-[15px] font-semibold text-[#0B1324]">
                      {data.batch?.label || 'Batch 001'} · {instructions.length} payment intents
                    </p>
                  </div>
                  <p className="text-[18px] font-semibold tabular-nums text-[#0B1324]">{batchTotal}</p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#64748B]">
                  {String(data.source.instruction ?? '')}
                </p>
              </section>

              <section className="overflow-hidden rounded-xl border border-[#D8DEE9] bg-white">
                <div className="flex items-center justify-between border-b border-[#EEF2F6] px-4 py-2.5">
                  <p className="text-[12px] font-semibold text-[#0B1324]">Payment instructions</p>
                  <p className="text-[11px] text-[#64748B]">Select one to open authority</p>
                </div>
                <ul className="max-h-[420px] divide-y divide-[#EEF2F6] overflow-y-auto">
                  {instructions.map((row) => {
                    const selected = (active?.id ?? '') === row.id
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRef(row.id)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition ${
                            selected ? 'bg-[#F1F5F9]' : 'hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-[#0B1324]">{row.id}</p>
                            <p className="truncate text-[11px] text-[#64748B]">
                              {row.vendor}
                              {row.rail ? ` · ${row.rail}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[12px] font-semibold tabular-nums text-[#0B1324]">
                              {formatInrFromMinor(row.amount_minor)}
                            </p>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {active ? (
                <section className="rounded-xl border border-[#D8DEE9] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Structured action draft · {active.id}
                    </p>
                    <EvidenceChip kind="blocked">NOT AUTHORIZED</EvidenceChip>
                  </div>
                  <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
                    <div>
                      <dt className="text-[#64748B]">Beneficiary</dt>
                      <dd className="font-medium text-[#0B1324]">{active.vendor}</dd>
                    </div>
                    <div>
                      <dt className="text-[#64748B]">Amount</dt>
                      <dd className="font-medium text-[#0B1324]">
                        {formatInrFromMinor(active.amount_minor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748B]">Rail</dt>
                      <dd className="font-medium text-[#0B1324]">
                        {active.rail || 'Rail from policy'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748B]">Batch total</dt>
                      <dd className="font-medium text-[#0B1324]">{batchTotal}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-[13px] text-[#64748B]">
                    {String(proposal?.rationale_summary ?? '')}
                  </p>
                  {data.attached_structure ? (
                    <div className="mt-4 rounded-md border border-l-4 border-[#D8DEE9] border-l-[#6D4AFF] bg-[#F7F8FB] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6D4AFF]">
                        Bound policy draft
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-[#0B1324]">
                        {data.attached_structure.policy_label ||
                          data.attached_structure.policy_draft?.label ||
                          'Policy draft'}
                      </p>
                      <p className="mt-1 text-[12px] text-[#0B1324]">
                        {data.attached_structure.policy_draft?.note ||
                          data.attached_structure.business_note}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                        {data.attached_structure.structure_id} ·{' '}
                        {data.attached_structure.payment_instructions?.length ||
                          data.attached_structure.batch?.intent_count ||
                          0}{' '}
                        instructions in structure
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-[#B7791F]">
                      No Policy Studio structure attached yet — construct one from a policy note to bind
                      all 100 instructions to this agent.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={href(
                        `/actions/${active.trace_id || activeTrace}/authority`,
                      )}
                      className="inline-flex h-10 items-center rounded-md bg-[#2E5BFF] px-4 text-[13px] font-semibold text-white hover:bg-[#2448D6]"
                    >
                      Next: Authority →
                    </Link>
                    <Link
                      href={href('/controls/policies?create=1')}
                      className="inline-flex h-10 items-center rounded-md border border-[#D8DEE9] px-4 text-[13px] font-semibold text-[#0B1324]"
                    >
                      Create policy
                    </Link>
                  </div>
                </section>
              ) : null}

              <ProtocolJsonPanel object={proposal} title="ActionProposal" />
            </div>

            <aside className="space-y-3">
              <section className="rounded-xl border border-[#D8DEE9] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6D4AFF]">
                  Agent identity
                </p>
                <p className="mt-2 text-[14px] font-semibold text-[#0B1324]">
                  {String(data.agent.purpose ?? 'Treasury Action Agent')}
                </p>
                <p className="mt-1 text-[12px] text-[#64748B]">{String(data.agent.agent_id)}</p>
                <p className="mt-2 text-[12px] text-[#64748B]">
                  Ceiling ₹
                  {(
                    Number(
                      (data.agent.max_amount_per_action as { amount_minor?: number } | undefined)
                        ?.amount_minor ?? 0,
                    ) / 100
                  ).toLocaleString('en-IN')}{' '}
                  · rails from attached policy
                </p>
              </section>

              {data.attached_structure ? (
                <BoundStructurePanel
                  structure={data.attached_structure}
                  compact
                  hrefForTrace={(traceId) => href(`/actions/${traceId}/dispatch`)}
                />
              ) : null}

              <div className="flex flex-col gap-2">
                <CopyChip label="Batch" value={data.batch?.batch_id || 'batch-001'} />
                <CopyChip label="Selected" value={active?.id || '—'} />
                <CopyChip label="Envelope" value={String(data.source.envelope_id ?? '')} />
              </div>
            </aside>
          </div>
        ) : null}
      </PageState>

      <FlowCompletionPopup
        open={proposalPopupOpen}
        onClose={() => setProposalPopupOpen(false)}
        title="Action proposal ready"
        description="Financial Action Agent built a grounded proposal from Batch 001 instructions. NOT AUTHORIZED until authority chain and PAC are signed."
        nextLabel="Authority"
        nextHref={href(`/actions/${activeTrace}/authority`)}
      />
    </div>
  )
}
