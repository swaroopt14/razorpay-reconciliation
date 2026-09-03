'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchSignals } from '@/services/protocol/controlPlaneClient'
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
import { ActionTraceSidebar } from './ActionTraceSidebar'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { FlowCompletionPopup } from './FlowCompletionPopup'
import {
  PollStatusBar,
  useProgressiveReveal,
} from '@/features/payout-command/shared/useProgressiveReveal'
import type { ProtocolObject } from '@/types/protocol'

const EMPTY_SIGNALS: ProtocolObject[] = []

type SignalsPayload = {
  items: ProtocolObject[]
  demo?: {
    trace_id: string
    human_ref: string
    beneficiary: string
    amount_display: string
    rail: string
    provider_reference?: string | null
    connector_name?: string
    current_state?: string
  }
  batch_totals?: {
    intent_count: number
    intended_display: string
  }
  dispatch_gate?: { message?: string }
}

export function SignalMeshSurface({ traceId }: { traceId: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <SignalMeshBody traceId={traceId} />
    </UploadGate>
  )
}

function SignalMeshBody({ traceId }: { traceId: string }) {
  const activeTrace = traceId?.trim() || CROSS_BORDER_TRACE_ID
  const { data, error, loading } = useProtocolQuery(`signals:${activeTrace}`, () =>
    fetchSignals(activeTrace),
  )
  const [open, setOpen] = useState<ProtocolObject | null>(null)
  const [signalsPopupOpen, setSignalsPopupOpen] = useState(false)
  const [signalsPopupShown, setSignalsPopupShown] = useState(false)
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)
  const payload = data as SignalsPayload | null
  const allItems = payload?.items ?? EMPTY_SIGNALS
  const demo = payload?.demo

  // Show popup once signals arrive
  useEffect(() => {
    if (allItems.length > 0 && !signalsPopupShown) {
      const t = window.setTimeout(() => {
        setSignalsPopupOpen(true)
        setSignalsPopupShown(true)
      }, 3000)
      return () => window.clearTimeout(t)
    }
  }, [allItems.length, signalsPopupShown])

  const stream = useProgressiveReveal(allItems, {
    intervalMs: 850,
    autoStart: true,
    resetKey: `${activeTrace}:${allItems.length}:${String(allItems[0]?.envelope_id ?? '')}`,
  })

  useEffect(() => {
    setOpen(null)
  }, [activeTrace])

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <ControlPlaneHeader
        title="Signal Mesh"
        subtitle="Provider callbacks arrive duplicated and out of order. Signals are polled one at a time — not dumped as a static list."
        chips={
          <>
            <EvidenceChip kind="inferred">Arrival order ≠ event time</EvidenceChip>
            <EvidenceChip kind="deterministic">
              {`${payload?.batch_totals?.intent_count ?? 100} · ${payload?.batch_totals?.intended_display ?? '₹1,23,77,867.56'}`}
            </EvidenceChip>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ActionTraceSidebar activeTraceId={activeTrace} mode="signals" />
        <div className="min-w-0 flex-1">
          <PageState loading={loading} error={error}>
            {payload ? (
              <div className="space-y-4 p-6">
                {demo ? (
                  <div className="rounded-lg border border-[#D8DEE9] bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Signals for this payout
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-[#0B1324]">
                      {demo.human_ref} · {demo.amount_display}
                    </p>
                    <p className="text-[12px] text-[#64748B]">
                      {demo.beneficiary} · {demo.rail}
                      {demo.connector_name ? ` · ${demo.connector_name}` : ''}
                      {demo.current_state
                        ? ` · ${demo.current_state.replace(/_/g, ' ')}`
                        : ''}
                    </p>
                  </div>
                ) : null}

                {payload.dispatch_gate?.message && allItems.length === 0 ? (
                  <p className="rounded-lg border border-[#F5E6C8] bg-[#FFFBEB] px-4 py-3 text-[13px] text-[#B7791F]">
                    {payload.dispatch_gate.message}
                  </p>
                ) : null}

                {allItems.length > 0 ? (
                  <PollStatusBar
                    label="Provider signal poll"
                    visibleCount={stream.visibleCount}
                    total={stream.total}
                    polling={stream.polling}
                    complete={stream.complete}
                    onStart={stream.start}
                    onStop={stream.stop}
                    startLabel="Start polling signals"
                    idleHint="Waiting for first provider callback"
                  />
                ) : null}

                <div className="overflow-x-auto rounded-lg border border-[#D8DEE9] bg-white">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="border-b border-[#D8DEE9] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Channel</th>
                        <th className="px-3 py-2">Raw type</th>
                        <th className="px-3 py-2">Occurred</th>
                        <th className="px-3 py-2">Received</th>
                        <th className="px-3 py-2">Signature</th>
                        <th className="px-3 py-2">Flags</th>
                        <th className="px-3 py-2">Mapping</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stream.visible.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-[#94A3B8]">
                            {allItems.length === 0
                              ? 'No signals for this payout yet.'
                              : stream.polling
                                ? 'Polling provider for first signal…'
                                : 'Start polling to receive signals one by one.'}
                          </td>
                        </tr>
                      ) : (
                        stream.visible.map((row, idx) => (
                          <tr
                            key={String(row.envelope_id)}
                            className={`border-b border-[#EEF2F6] ${
                              idx === stream.visible.length - 1 && stream.polling
                                ? 'bg-[#F8FAFC]'
                                : ''
                            }`}
                          >
                            <td className="px-3 py-2 tabular-nums text-[#94A3B8]">{idx + 1}</td>
                            <td className="px-3 py-2">{String(row.channel)}</td>
                            <td className="px-3 py-2 font-medium text-[#0B1324]">
                              {String(row.raw_event_type)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {String(row.occurred_at)}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {String(row.received_at)}
                            </td>
                            <td className="px-3 py-2">
                              {(row.source_signature as { verified?: boolean } | undefined)
                                ?.verified ? (
                                <EvidenceChip kind="verified">Verified</EvidenceChip>
                              ) : (
                                <EvidenceChip kind="blocked">Unverified</EvidenceChip>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.duplicate ? (
                                <EvidenceChip kind="inferred">Duplicate</EvidenceChip>
                              ) : null}
                              {row.late ? <EvidenceChip kind="inferred">Late</EvidenceChip> : null}
                              {row.accepted ? (
                                <EvidenceChip kind="deterministic">Accepted</EvidenceChip>
                              ) : (
                                <EvidenceChip kind="blocked">Rejected</EvidenceChip>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="text-[#2E5BFF] hover:underline"
                                onClick={() => setOpen(row)}
                              >
                                {String(row.mapping_candidate)}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyChip
                    label="Provider ref"
                    value={demo?.provider_reference || '—'}
                  />
                  <CopyChip label="Trace" value={activeTrace} />
                  <CopyChip
                    label="Signals"
                    value={`${stream.visibleCount}/${allItems.length}`}
                  />
                </div>
                <Link
                  href={href(`/actions/${activeTrace}/lifecycle`)}
                  className="inline-flex h-10 items-center rounded-md bg-[#0B1324] px-4 text-[13px] font-semibold text-white"
                >
                  Open Lifecycle Graph
                </Link>
                {open ? (
                  <ProtocolJsonPanel object={open} title="SignalEnvelope" />
                ) : (
                  <ProtocolJsonPanel object={stream.visible} title="SignalEnvelope[] (polled)" />
                )}
              </div>
            ) : null}
          </PageState>
        </div>
      </div>

      <FlowCompletionPopup
        open={signalsPopupOpen}
        onClose={() => setSignalsPopupOpen(false)}
        title="Signals received"
        description={`Provider callbacks arrived — ${allItems.length} signals processed. Duplicates and late arrivals are tracked. Next: derive lifecycle from accepted evidence.`}
        nextLabel="Lifecycle"
        nextHref={href(`/actions/${activeTrace}/lifecycle`)}
        traceId={activeTrace}
      />
    </div>
  )
}
