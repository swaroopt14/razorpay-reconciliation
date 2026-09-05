'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_DISPATCH_ROWS,
  DISPATCH_FLOW_STAGES,
  DISPATCH_RELAY_HEADER,
  flowStageIndex,
  modeBannerCopy,
  type DispatchAttempt,
  type DispatchRow,
  type DispatchStatus,
} from '@/services/payout-command/demo/dispatchRelayDemo'
import {
  useBatchDispatched,
  useBatchPolicy,
  useDemoBatchReady,
  useDispatchedBatchId,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import {
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  getStoredScenario,
  withScenarioScope,
  type ConsoleScenario,
} from '@/services/payout-command/demo/scenarioMode'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { DemoTablePager, type DemoTablePageSize } from '../demo/DemoTablePager'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'

type Notice = { tone: 'ok' | 'warn' | 'err'; text: string }
type View = 'list' | 'detail'

function statusTone(_status: DispatchStatus): string {
  return 'bg-[#0B1324] text-white'
}

/**
  * Spec 7.9 - Dispatch & Relay.
  * List = full table of payouts · click Open → detail for that payout only.
  */
export function DispatchRelaySurface() {
  const searchParams = useSearchParams()
  const { ready, readiness, require, activeBatchId } = useDemoBatchReady(undefined, { require: 'intent' })
  const batchDispatched = useBatchDispatched(activeBatchId)
  const dispatchedBatchId = useDispatchedBatchId()
  const activeDispatchedBatchId = batchDispatched ? activeBatchId : null
  const attachedPolicy = useBatchPolicy(activeDispatchedBatchId ?? undefined)
  const [rows, setRows] = useState<DispatchRow[]>([])
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [extRef, setExtRef] = useState('')
  const [scenario, setScenario] = useState<ConsoleScenario>('inr')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<DemoTablePageSize>(20)
  const dispatchLock = useRef(false)

  useEffect(() => {
    setScenario(getStoredScenario())
  }, [])

  useEffect(() => {
    if (!ready) {
      setRows([])
      return
    }
    setRows(
      DEMO_DISPATCH_ROWS.map((r) => ({
        ...r,
        attempts: r.attempts.map((a) => ({ ...a })),
        route: { ...r.route },
      })),
    )
  }, [ready])

  useEffect(() => {
    const contract = searchParams.get('contract')?.trim()
    if (!contract) return
    const match = rows.find(
      (r) => r.contractId === contract || r.contractId.toLowerCase() === contract.toLowerCase(),
    )
    if (match) {
      setSelectedId(match.id)
      setView('detail')
    }
  }, [searchParams, rows])

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null
  const listStats = useMemo(() => {
    const sealed = rows.filter((r) => r.sealed)
    const dispatchedValue = Math.round(sealed.reduce((s, r) => s + r.amountRupees, 0) * 100) / 100
    const acknowledged = rows.filter(
      (r) => r.flowStage === 'Acknowledged' || r.flowStage === 'Processing' || r.flowStage === 'Outcome observed',
    ).length
    const outcomeObserved = rows.filter((r) => r.flowStage === 'Outcome observed').length
    const failedOrRetry = rows.filter(
      (r) => r.status === 'Failed' || r.status === 'Retry eligible' || r.status === 'Cancelled',
    ).length
    return {
      payoutCount: rows.length,
      dispatchedCount: sealed.length,
      dispatchedValue,
      acknowledged,
      outcomeObserved,
      failedOrRetry,
    }
  }, [rows])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  const modeInfo = selected ? modeBannerCopy(selected.mode) : null
  const stageIdx = selected ? flowStageIndex(selected.flowStage) : -1

  const hashMatch = useMemo(() => {
    if (!selected || !selected.sealed) return null
    const latest = selected.attempts[0]
    if (!latest) return null
    return latest.requestHash === selected.contractHash
  }, [selected])

  function openRow(id: string) {
    setSelectedId(id)
    setView('detail')
    setNotice(null)
    setExtRef('')
  }

  function backToList() {
    setView('list')
    setNotice(null)
    setExtRef('')
  }

  function updateSelected(patch: Partial<DispatchRow>) {
    if (!selected) return
    setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)))
  }

  function dispatchNow() {
    if (!selected || !modeInfo) return
    if (!selected.sealed) {
      setNotice({ tone: 'err', text: 'Unsealed contracts cannot dispatch.' })
      return
    }
    if (!modeInfo.showDispatchNow) {
      setNotice({
        tone: 'warn',
        text: `${selected.mode} does not allow an active send. Use “${modeInfo.primaryLabel}”.`,
      })
      return
    }
    if (dispatchLock.current) {
      setNotice({
        tone: 'warn',
        text: 'Dispatch already in flight - duplicate clicks cannot create a new attempt.',
      })
      return
    }
    if (selected.status === 'Acknowledged' || selected.flowStage === 'Outcome observed') {
      setNotice({
        tone: 'warn',
        text: 'Already acknowledged. A new click does not create a duplicate attempt.',
      })
      return
    }

    dispatchLock.current = true
    const idem =
      selected.attempts.find((a) => a.idempotencyKey)?.idempotencyKey ??
      `idem_${selected.humanRef.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_v1`

    const attempt: DispatchAttempt = {
      attemptId: `att-${selected.id}-live`,
      idempotencyKey: idem,
      requestHash: selected.contractHash,
      sentAt: 'just now (sandbox)',
      responseCode: '202 Accepted',
      providerRef: `SANDBOX-REF-${selected.humanRef}`,
      status: 'Acknowledged',
      note: 'Sandbox dispatch · request hash matches sealed contract · not a live bank send',
    }

    updateSelected({
      status: 'Acknowledged',
      flowStage: 'Acknowledged',
      outboxReceipt: selected.outboxReceipt ?? `outbox-${selected.id}`,
      attempts: [attempt, ...selected.attempts.filter((a) => a.attemptId !== attempt.attemptId)],
    })
    setNotice({
      tone: 'ok',
      text: `Sandbox · ${modeInfo.primaryLabel} completed for ${selected.humanRef}. Provider ref ${attempt.providerRef}.`,
    })
    window.setTimeout(() => {
      dispatchLock.current = false
    }, 800)
  }

  function exportFile() {
    if (!selected?.sealed) {
      setNotice({ tone: 'err', text: 'Unsealed contracts cannot export a signed instruction.' })
      return
    }
    updateSelected({
      status: selected.status === 'Prepared' ? 'Sent' : selected.status,
      flowStage: selected.flowStage === 'Prepared' ? 'Sent' : selected.flowStage,
      attempts:
        selected.attempts.length > 0
          ? selected.attempts
          : [
              {
                attemptId: `att-${selected.id}-file`,
                idempotencyKey: `idem_${selected.id}_file_v1`,
                requestHash: selected.contractHash,
                sentAt: 'just now (sandbox)',
                responseCode: 'FILE_QUEUED',
                providerRef: null,
                status: 'Sent',
                note: 'Signed payout file exported for bank upload',
              },
            ],
    })
    setNotice({
      tone: 'ok',
      text: `Signed payout file prepared for ${selected.humanRef} (sandbox).`,
    })
  }

  function recordExternal() {
    if (!selected) return
    const ref = extRef.trim()
    if (ref.length < 4) {
      setNotice({ tone: 'err', text: 'Enter an external dispatch reference (min 4 characters).' })
      return
    }
    const attempt: DispatchAttempt = {
      attemptId: `att-${selected.id}-ext`,
      idempotencyKey: `idem_${selected.id}_ext_v1`,
      requestHash: selected.contractHash,
      sentAt: 'external · recorded just now',
      responseCode: 'EXTERNAL',
      providerRef: ref,
      status: 'Acknowledged',
      note: 'External dispatch reference recorded - Zord did not send',
    }
    updateSelected({
      status: 'Acknowledged',
      flowStage: 'Acknowledged',
      attempts: [attempt, ...selected.attempts],
    })
    setExtRef('')
    setNotice({ tone: 'ok', text: `External reference recorded: ${ref}` })
  }

  function retryEligible() {
    if (!selected) return
    if (selected.status !== 'Retry eligible' && !selected.attempts.some((a) => a.status === 'Retry eligible')) {
      setNotice({ tone: 'warn', text: 'No retry-eligible attempt on this dispatch.' })
      return
    }
    const key = selected.attempts.find((a) => a.idempotencyKey)?.idempotencyKey
    if (!key) return
    const attempt: DispatchAttempt = {
      attemptId: `att-${selected.id}-retry`,
      idempotencyKey: key,
      requestHash: selected.contractHash,
      sentAt: 'just now (sandbox retry)',
      responseCode: '202 Accepted',
      providerRef: `SANDBOX-RETRY-${selected.humanRef}`,
      status: 'Acknowledged',
      note: 'Retry preserved original idempotency key - no new obligation',
    }
    updateSelected({
      status: 'Acknowledged',
      flowStage: 'Acknowledged',
      attempts: [attempt, ...selected.attempts.filter((a) => a.status !== 'Retry eligible')],
    })
    setNotice({ tone: 'ok', text: 'Retry completed with same idempotency key.' })
  }

  if (!ready) {
    return (
      <div className="bg-[#F8FAFC] pb-10">
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <PageExplainerBanner page="dispatch" />
        </div>
        <header className="shrink-0 border-b border-[#E5E5E5] bg-white px-5 py-4 sm:px-6">
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {DISPATCH_RELAY_HEADER.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{DISPATCH_RELAY_HEADER.subtitle}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <AwaitingUploadsEmptyState
            title="No dispatch attempts yet"
            readiness={readiness}
            require={require}
          />
        </div>
      </div>
    )
  }

  /* The dispatch table stays empty until the batch is dispatched from the Intent Journal. */
  if (!batchDispatched) {
    return (
      <div className="bg-[#F8FAFC] pb-10">
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <PageExplainerBanner page="dispatch" />
        </div>
        <header className="shrink-0 border-b border-[#E5E5E5] bg-white px-5 py-4 sm:px-6">
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {DISPATCH_RELAY_HEADER.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{DISPATCH_RELAY_HEADER.subtitle}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mx-auto max-w-[560px] border border-[#E5E5E5] bg-white px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-[#0B1324]">Nothing dispatched yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#64748B]">
              Upload a bulk file on Payouts, let AI recommend the rail, then Approve &amp; Dispatch.
              Provider status stays pending until you approve.
            </p>
            <Link
              href={withDemoBatchScope('/payouts')}
              className="mt-4 inline-flex h-9 items-center bg-[#2E5BFF] px-4 text-[13px] font-semibold text-white hover:bg-[#2448D4]"
            >
              Open Payouts
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#F8FAFC] pb-10">
      {view === 'list' ? (
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <PageExplainerBanner page="dispatch" />
        </div>
      ) : null}
      <header className="shrink-0 border-b border-[#E5E5E5] bg-white px-5 py-4 sm:px-6">
        {view === 'detail' ? (
          <button
            type="button"
            onClick={backToList}
            className="mb-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
          >
            ← Back to payouts
          </button>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {DISPATCH_RELAY_HEADER.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#64748B]">{DISPATCH_RELAY_HEADER.subtitle}</p>
          </div>
          {view === 'list' ? (
            scenario === SCENARIO_CROSS_BORDER ? (
              <Link
                href={withScenarioScope(
                  withDemoBatchScope(`/actions/${CROSS_BORDER_TRACE_ID}/signals`),
                  SCENARIO_CROSS_BORDER,
                )}
                className="inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Next · Signals →
              </Link>
            ) : (
              <Link
                href={withDemoBatchScope('/settlement/journal')}
                className="inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Next · Settlement →
              </Link>
            )
          ) : null}
        </div>
        {notice ? (
          <p
            role="status"
            className={`mt-3 border px-3 py-2 text-[13px] ${
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
      </header>

      <div>
        {view === 'list' ? (
          <div className="mx-auto max-w-[1280px] space-y-4">
            <LifecycleSummaryStrip
              heroLabel="Dispatched instruction value"
              heroValue={new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(listStats.dispatchedValue)}
              heroHint={`${listStats.dispatchedCount.toLocaleString('en-IN')} sealed instructions dispatched · sandbox rail`}
              cells={[
                {
                  label: 'Dispatched',
                  value: String(listStats.dispatchedCount),
                  hint: 'Sealed instructions in this dispatch batch',
                },
                {
                  label: 'Acknowledged+',
                  value: String(listStats.acknowledged),
                  hint: 'Provider ack, processing, or outcome observed',
                },
                {
                  label: 'Outcome observed',
                  value: String(listStats.outcomeObserved),
                  hint: 'Downstream signal linked to attempt',
                },
                {
                  label: 'Failed / retry',
                  value: String(listStats.failedOrRetry),
                  hint: 'Needs retry with same idempotency key',
                },
              ]}
            />
            {/* Batch context - dispatched status + attached policy */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-[#E5E5E5] bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-[13px] text-[#0B1324]">
                <span className="font-mono font-semibold">{activeDispatchedBatchId}</span>
                <span className="inline-flex h-5 items-center bg-[#0B1324] px-2 text-[10px] font-bold uppercase tracking-wide text-white">
                  Dispatched
                </span>
              </span>
              <span className="text-[13px] text-[#64748B]">
                Policy:{' '}
                {attachedPolicy ? (
                  <span className="font-semibold text-[#0B1324]">{attachedPolicy}</span>
                ) : (
                  <span>none attached - draft one in Policy Studio</span>
                )}
              </span>
              <span className="text-[12px] text-[#94A3B8]">Sandbox · illustrative signals</span>
            </div>

            {/* Incoming signals - agent, bank, system */}
            <div className="border border-[#E5E5E5] bg-white">
              <div className="border-b border-[#E5E5E5] px-4 py-2.5">
                <p className="text-[13px] font-semibold text-[#0B1324]">Incoming signals</p>
              </div>
              <ul className="divide-y divide-[#E5E5E5]">
                {[
                  {
                    source: 'Zord agent',
                    ai: true,
                    text: `Batch ${activeDispatchedBatchId} dispatched from Intent Journal - request hashes match sealed contracts.`,
                    at: 'just now',
                  },
                  {
                    source: 'System',
                    ai: false,
                    text: attachedPolicy
                      ? `Policy "${attachedPolicy}" evaluated pre-dispatch - no blocking rule fired.`
                      : 'No policy attached to this batch - dispatch proceeded without policy gate.',
                    at: 'just now',
                  },
                  {
                    source: 'Bank (sandbox)',
                    ai: false,
                    text: '202 Accepted - instructions acknowledged by sandbox rail.',
                    at: 'moments ago',
                  },
                  {
                    source: 'System',
                    ai: false,
                    text: 'Outbox receipts created - awaiting settlement signals in Settlement Journal.',
                    at: 'moments ago',
                  },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className={`inline-flex h-5 shrink-0 items-center px-2 text-[10px] font-bold uppercase tracking-wide text-white ${
                        s.ai ? 'bg-[#6D4AFF]' : 'bg-[#0B1324]'
                      }`}
                    >
                      {s.source}
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] text-[#0B1324]">{s.text}</p>
                    <span className="shrink-0 text-[11px] text-[#94A3B8]">{s.at}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden border border-[#E5E5E5] bg-white">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-[#E5E5E5] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3">Payout</th>
                    <th className="px-4 py-3">Payee</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-[#FAFAFA]"
                      onClick={() => openRow(row.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-[13px] font-semibold text-[#0B1324]">
                          {row.humanRef}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#94A3B8]">
                          {row.contractId}
                          {!row.sealed ? (
                            <span className="ml-2 font-sans font-semibold text-[#0B1324]">
                              Unsealed
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#334155]">{row.payeeLabel}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-[#0B1324]">
                        {row.amountLabel}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[#64748B]">{row.mode}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2 text-[11px] font-semibold ${statusTone(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[12px] font-semibold text-[#2563EB]">Open →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DemoTablePager
                page={safePage}
                pageSize={pageSize}
                total={rows.length}
                noun="payouts"
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </div>
        ) : selected && modeInfo ? (
          <div className="mx-auto max-w-[820px] space-y-5 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[1.2rem] font-semibold text-[#0B1324]">
                  {selected.humanRef}
                </p>
                <p className="mt-1 text-[13px] text-[#64748B]">
                  {selected.payeeLabel}
                  <span className="mx-1.5 text-[#E2E8F0]">·</span>
                  {selected.amountLabel}
                  <span className="mx-1.5 text-[#E2E8F0]">·</span>
                  {selected.contractId}
                </p>
              </div>
              <span
                className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2 text-[11px] font-semibold ${statusTone(selected.status)}`}
              >
                {selected.status}
              </span>
            </div>

            <section
              className={`border px-4 py-3 ${
                selected.mode === 'Observability only'
                  ? 'border-[#0B1324]/20 bg-[#F1F5F9]'
                  : 'border-[#E5E5E5] bg-white'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Dispatch mode
              </p>
              <p className="mt-1 text-[15px] font-semibold text-[#0B1324]">{modeInfo.title}</p>
              <p className="mt-1 text-[13px] text-[#334155]">{modeInfo.body}</p>
            </section>

            <section className="border border-[#E5E5E5] bg-white px-4 py-4">
              <p className="text-[12px] font-semibold text-[#0B1324]">Relay flow</p>
              <ol className="mt-3 flex flex-wrap items-center gap-1">
                {DISPATCH_FLOW_STAGES.map((stage, i) => {
                  const done = i <= stageIdx
                  const current = i === stageIdx
                  return (
                    <li key={stage} className="flex items-center gap-1">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          current
                            ? 'bg-[#0B1324] text-white'
                            : done
                              ? 'bg-[#F1F5F9] text-[#0B1324]'
                              : 'bg-[#F1F5F9] text-[#94A3B8]'
                        }`}
                      >
                        {stage}
                      </span>
                      {i < DISPATCH_FLOW_STAGES.length - 1 ? (
                        <span className="text-[#CBD5E1]">→</span>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            </section>

            <section className="border border-[#E5E5E5] bg-white">
              <div className="border-b border-[#E5E5E5] px-4 py-3">
                <p className="text-[14px] font-semibold text-[#0B1324]">Route decision</p>
              </div>
              <div className="grid gap-0 sm:grid-cols-2">
                <Field
                  label="Selected provider / rail"
                  value={`${selected.route.provider} · ${selected.route.rail}`}
                />
                <Field label="Reason" value={selected.route.reason} />
                <Field label="SLA" value={selected.route.sla} />
                <Field label="Fee / FX constraints" value={selected.route.feeFxConstraints} />
                <Field label="Fallback" value={selected.route.fallback} />
                <Field label="Contract hash" value={selected.contractHash} mono />
              </div>
              {hashMatch != null ? (
                <p
                  className={`border-t border-[#E5E5E5] px-4 py-2.5 text-[12px] font-medium ${
                    hashMatch ? 'text-[#0B1324]' : 'text-[#0B1324]'
                  }`}
                >
                  {hashMatch
                    ? 'Request hash matches the sealed contract version.'
                    : 'Request hash does not match sealed contract.'}
                </p>
              ) : null}
            </section>

            <section className="border border-[#E5E5E5] bg-white">
              <div className="border-b border-[#E5E5E5] px-4 py-3">
                <p className="text-[14px] font-semibold text-[#0B1324]">Attempt ledger</p>
              </div>
              {selected.attempts.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-[#94A3B8]">
                  No attempts yet.{' '}
                  {selected.sealed ? 'Ready to prepare a send.' : 'Seal the contract first.'}
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E5E5]">
                  {selected.attempts.map((a) => (
                    <li key={a.attemptId} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-[12px] font-semibold text-[#0B1324]">
                          {a.attemptId}
                        </p>
                        <span
                          className={`inline-flex h-6 min-w-[6.5rem] items-center justify-center px-2 text-[10px] font-semibold ${statusTone(a.status)}`}
                        >
                          {a.status}
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-1 text-[12px] text-[#475569] sm:grid-cols-2">
                        <div>
                          <dt className="text-[#94A3B8]">Idempotency key</dt>
                          <dd className="font-mono">{a.idempotencyKey}</dd>
                        </div>
                        <div>
                          <dt className="text-[#94A3B8]">Request hash</dt>
                          <dd className="break-all font-mono text-[11px]">{a.requestHash}</dd>
                        </div>
                        <div>
                          <dt className="text-[#94A3B8]">Sent at</dt>
                          <dd>{a.sentAt ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-[#94A3B8]">Response code</dt>
                          <dd>{a.responseCode ?? '-'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-[#94A3B8]">Provider ref</dt>
                          <dd className="font-mono font-semibold text-[#0B1324]">
                            {a.providerRef ?? '- awaiting acknowledgement'}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-[12px] text-[#64748B]">{a.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {selected.mode === 'Observability only' ? (
              <div className="flex flex-wrap items-end gap-2 border border-[#E5E5E5] bg-white px-4 py-3">
                <label className="min-w-[200px] flex-1 text-[12px] text-[#64748B]">
                  External dispatch reference
                  <input
                    value={extRef}
                    onChange={(e) => setExtRef(e.target.value)}
                    className="mt-1 h-9 w-full border border-[#E5E5E5] px-2.5 text-[13px] text-[#0B1324]"
                    placeholder="Bank UTR / external ref"
                  />
                </label>
                <button
                  type="button"
                  onClick={recordExternal}
                  className="h-9 bg-[#0B1324] px-3 text-[13px] font-semibold text-white"
                >
                  Record external reference
                </button>
              </div>
            ) : null}

            <footer className="flex flex-wrap items-center gap-2 border border-[#E5E5E5] bg-white px-4 py-3">
              {modeInfo.showDispatchNow ? (
                <button
                  type="button"
                  onClick={dispatchNow}
                  disabled={!selected.sealed}
                  className="h-9 bg-[#2E5BFF] px-3.5 text-[13px] font-semibold text-white hover:bg-[#2448D4] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                >
                  {modeInfo.primaryLabel}
                </button>
              ) : selected.mode === 'File export' ? (
                <button
                  type="button"
                  onClick={exportFile}
                  disabled={!selected.sealed}
                  className="h-9 bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                >
                  Export signed payout file
                </button>
              ) : null}
              <button
                type="button"
                onClick={exportFile}
                disabled={!selected.sealed}
                className="h-9 border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] disabled:opacity-40"
              >
                Export signed instruction
              </button>
              <button
                type="button"
                onClick={retryEligible}
                disabled={
                  selected.status !== 'Retry eligible' &&
                  !selected.attempts.some((a) => a.status === 'Retry eligible')
                }
                className="h-9 border border-[#0B1324]/20 bg-[#F1F5F9] px-3 text-[13px] font-semibold text-[#0B1324] disabled:opacity-40"
              >
                Retry eligible attempt
              </button>
              <Link
                href={selected.contractHref}
                className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
              >
                Open Action Contract
              </Link>
              <Link
                href={selected.traceHref}
                className="inline-flex h-9 items-center px-2 text-[13px] font-semibold text-[#2563EB] hover:underline"
              >
                Open trace
              </Link>
            </footer>
          </div>
        ) : (
          <p className="p-8 text-center text-[13px] text-[#94A3B8]">
            Payout not found.{' '}
            <button type="button" onClick={backToList} className="font-semibold text-[#2563EB]">
              Back to list
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-[#F1F5F9] px-4 py-3 sm:odd:border-r sm:odd:border-[#F1F5F9]">
      <p className="text-[11px] font-medium text-[#64748B]">{label}</p>
      <p className={`mt-0.5 text-[13px] text-[#0B1324] ${mono ? 'break-all font-mono text-[11px]' : ''}`}>
        {value}
      </p>
    </div>
  )
}
