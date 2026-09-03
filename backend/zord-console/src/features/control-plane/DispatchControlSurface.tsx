'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import { markBatchDispatched } from '@/services/payout-command/demo/demoBatchReadiness'
import {
  ControlPlaneHeader,
  CopyChip,
  EvidenceChip,
} from './ProtocolChrome'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { WorkflowStepper, WorkflowNavButtons } from './WorkflowStepper'
import DISPATCH_MOCK from '@/data/dispatch-mock.json'

export function DispatchControlSurface({ traceId }: { traceId?: string }) {
  return (
    <UploadGate title="No payment obligations yet">
      <DispatchBody traceId={traceId} />
    </UploadGate>
  )
}

function DispatchBody({ traceId }: { traceId?: string }) {
  const activeTrace = traceId?.trim() || DISPATCH_MOCK.trace_id
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)
  const data = DISPATCH_MOCK
  const batch = data.batch
  const gate = data.dispatch_gate
  const [dispatching, setDispatching] = useState(false)
  const [dispatched, setDispatched] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  function handleDispatch() {
    setDispatching(true)
    window.setTimeout(() => {
      setDispatching(false)
      setDispatched(true)
      setShowPopup(true)
      // Sync with Intent Journal — marks batch as dispatched across all pages
      markBatchDispatched('batch-001')
    }, 2000)
  }

  const selected = selectedIdx !== null ? data.instructions[selectedIdx] : null

  return (
    <div className="bg-[#F7F8FB]">
      <WorkflowStepper
        activeStep="dispatch"
        traceId={activeTrace}
        context={{ batch: batch.label, action: `${batch.instruction_count} actions`, beneficiary: batch.intent_total_display, amount: batch.intent_total_display, rail: data.allowed_rails.join(', ') }}
      />
      <WorkflowNavButtons
        backLabel="Payment Contract"
        backHref={href(`/actions/${activeTrace}/contract`)}
        nextLabel="Signals"
        nextHref={href(`/actions/${activeTrace}/signals`)}
        nextEnabled={dispatched}
      />
      <ControlPlaneHeader
        title="Dispatch Control"
        subtitle={`Batch ${batch.label} · ${batch.instruction_count} payment actions · ${batch.intent_total_display} total value`}
        chips={dispatched ? (
          <>
            <EvidenceChip kind="verified">Gateway executed</EvidenceChip>
            <EvidenceChip kind="deterministic">Batch dispatched</EvidenceChip>
          </>
        ) : (
          <>
            <EvidenceChip kind="agent">Agent recommended</EvidenceChip>
            <EvidenceChip kind="inferred">Awaiting user dispatch</EvidenceChip>
          </>
        )}
      />

      <div className="space-y-4 p-6">
        {/* Batch summary card */}
        <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Batch</p>
              <p className="text-[18px] font-bold text-[#0B1324]">{batch.label} <span className="text-[14px] font-normal text-[#64748B]">· {batch.instruction_count} instructions</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Intent payment value</p>
              <p className="text-[22px] font-bold tabular-nums text-[#0B1324]">{batch.intent_total_display}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Policy', batch.policy],
              ['Agent', batch.agent_label],
              ['Currency', batch.currency],
              ['Rails', data.allowed_rails.join(', ')],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</p>
                <p className="text-[13px] font-semibold text-[#0B1324]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <CopyChip label="PAC" value={data.pac_id} />
            <CopyChip label="Trace" value={activeTrace} />
          </div>
        </section>

        {/* Connector + preflight */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-[#D8DEE9] bg-white p-4 lg:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Recommended connector</p>
            <p className="mt-1 text-[15px] font-semibold text-[#0B1324]">{data.recommended_connector.name}</p>
            <p className="text-[12px] text-[#64748B]">
              Health {data.recommended_connector.health} · Cutoff {data.recommended_connector.cutoff} · {data.recommended_connector.cost}
            </p>
            <p className="mt-2 text-[12px] text-[#0B1324]">
              Allowed rails: {data.allowed_rails.join(', ')}
              <span className="ml-1 text-[11px] text-[#64748B]">· from policy</span>
            </p>
            {gate.structure_id ? (
              <p className="mt-1 font-mono text-[11px] text-[#2E5BFF]">Structure {gate.structure_id}</p>
            ) : null}
          </section>

          <section className="rounded-lg border border-[#D8DEE9] bg-white p-4 lg:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Preflight checks</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {data.preflight.map((row) => (
                <li key={row.check} className="flex items-center gap-2 rounded border border-[#E2E8F0] px-2.5 py-1.5 text-[12px]">
                  <span className={`font-bold ${row.result === 'PASS' ? 'text-[#138A63]' : row.result === 'SKIP' ? 'text-[#B7791F]' : 'text-[#C2413B]'}`}>{row.result}</span>
                  <span className="text-[#0B1324]">{row.check}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Dispatch button */}
        <div className="flex flex-wrap items-center gap-3">
          {!dispatched ? (
            <button type="button" disabled={dispatching} onClick={handleDispatch} className="inline-flex h-11 items-center rounded-md bg-[#2E5BFF] px-6 text-[14px] font-bold text-white hover:bg-[#2448D6] disabled:opacity-50">
              {dispatching ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Dispatching batch…
                </span>
              ) : (
                `Dispatch Batch · ${batch.instruction_count} actions · ${batch.intent_total_display}`
              )}
            </button>
          ) : (
            <EvidenceChip kind="verified">✓ Batch dispatched by user</EvidenceChip>
          )}
          <Link href={href('/agents')} className={`inline-flex h-10 items-center rounded-md px-4 text-[13px] font-semibold ${dispatched ? 'bg-[#0B1324] text-white' : 'border border-[#D8DEE9] bg-white text-[#94A3B8]'}`}>
            Open Agent Registry
          </Link>
          <Link href={href(`/actions/${activeTrace}/signals`)} className={`inline-flex h-10 items-center rounded-md border border-[#D8DEE9] px-4 text-[13px] font-semibold ${dispatched ? 'text-[#0B1324]' : 'text-[#94A3B8]'}`}>
            Open Signals
          </Link>
        </div>

        {!dispatched ? (
          <p className="text-[12px] text-[#B7791F]">After dispatch, the batch moves to the approved rail. The agent cannot execute this step — only you can dispatch.</p>
        ) : null}

        {/* Instruction detail table */}
        <section className="rounded-lg border border-[#D8DEE9] bg-white">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-[#0B1324]">Payment Actions ({data.instructions.length})</p>
              <p className="text-[11px] text-[#64748B]">Batch 001 · {batch.intent_total_display} total</p>
            </div>
            {dispatched && (
              <EvidenceChip kind="verified">Ready for settlement</EvidenceChip>
            )}
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-[#F1F5F9]">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2">Beneficiary</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Rail</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.instructions.map((instr, i) => (
                  <tr
                    key={instr.ref}
                    className={`cursor-pointer transition-colors ${selectedIdx === i ? 'bg-[#EEF2FF]' : 'hover:bg-[#F8FAFC]'}`}
                    onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  >
                    <td className="px-4 py-2 tabular-nums text-[#94A3B8]">{i + 1}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-[#0B1324]">{instr.ref}</td>
                    <td className="px-4 py-2 text-[#0B1324]">{instr.payee}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-[#0B1324]">{instr.amount_display}</td>
                    <td className="px-4 py-2 font-mono text-[#64748B]">{instr.rail}</td>
                    <td className="px-4 py-2">
                      {dispatched ? (
                        <span className="inline-block rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#138A63]">DISPATCHED</span>
                      ) : (
                        <span className="inline-block rounded-full bg-[#FEF9C3] px-2 py-0.5 text-[10px] font-bold text-[#B7791F]">READY</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Selected instruction detail */}
          {selected ? (
            <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Action detail</p>
                  <p className="text-[15px] font-bold text-[#0B1324]">{selected.ref} <span className="text-[13px] font-normal text-[#64748B]">· {selected.payee}</span></p>
                </div>
                <button type="button" onClick={() => setSelectedIdx(null)} className="text-[11px] text-[#94A3B8] hover:text-[#0B1324]">Close</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Amount', selected.amount_display],
                  ['Currency', selected.currency],
                  ['Rail', selected.rail],
                  ['Intent ID', selected.intent_id],
                  ['Status', dispatched ? 'DISPATCHED' : 'READY'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">{label}</p>
                    <p className="text-[13px] font-semibold text-[#0B1324]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* Dispatch success popup */}
      {showPopup ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B1324]/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg border border-[#E2E8F0] bg-white p-6 shadow-lg">
            {/* Green success header */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCFCE7]">
                <svg className="h-5 w-5 text-[#138A63]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#138A63]">Batch dispatched</p>
                <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[#0B1324]">{batch.label} — {batch.intent_total_display}</h2>
              </div>
            </div>

            {/* Flow diagram: Dispatched through rail → to beneficiaries */}
            <div className="mt-5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-center gap-3 text-[13px]">
                <div className="rounded-md border border-[#D8DEE9] bg-white px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[#64748B]">Dispatched</p>
                  <p className="font-bold text-[#138A63]">{batch.label}</p>
                </div>
                <div className="flex flex-col items-center text-[#94A3B8]">
                  <span className="text-[11px]">through</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                </div>
                <div className="rounded-md border border-[#2E5BFF]/30 bg-[#EEF2FF] px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[#2E5BFF]">{data.recommended_connector.name}</p>
                  <p className="font-semibold text-[#0B1324]">{data.recommended_connector.id}</p>
                </div>
                <div className="flex flex-col items-center text-[#94A3B8]">
                  <span className="text-[11px]">to</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                </div>
                <div className="rounded-md border border-[#D8DEE9] bg-white px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[#64748B]">Beneficiaries</p>
                  <p className="font-bold text-[#0B1324]">{batch.instruction_count} accounts</p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#64748B]">Actions dispatched</p>
                <p className="font-bold text-[#0B1324]">{batch.instruction_count} payment actions</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#64748B]">Total value</p>
                <p className="font-bold text-[#0B1324]">{batch.intent_total_display}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#64748B]">Rail</p>
                <p className="font-bold text-[#0B1324]">{data.allowed_rails.join(' · ')}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#64748B]">Trace</p>
                <p className="font-mono font-bold text-[#0B1324]">{activeTrace}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowPopup(false)} className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-4 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]">Stay here</button>
              <button type="button" onClick={() => { setShowPopup(false); window.location.href = href('/settlement/journal') }} className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-4 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]">Settlement →</button>
              <button type="button" onClick={() => { setShowPopup(false); window.location.href = href('/proof') }} className="inline-flex h-9 items-center bg-[#2E5BFF] px-4 text-[12px] font-semibold text-white hover:bg-[#2448D6]">Open Proof →</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
