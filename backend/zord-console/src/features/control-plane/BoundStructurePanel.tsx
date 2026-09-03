'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AgentBoundStructure } from '@/services/protocol/controlPlaneClient'

export type StructurePaymentRow = {
  human_ref: string
  intent_id?: string
  beneficiary: string
  amount_rupees?: number
  amount_minor?: number
  currency?: string
  rail?: string
  current_state?: string
  trace_id?: string
}

function formatInr(rupees: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees)
}

function amountOf(row: StructurePaymentRow) {
  if (typeof row.amount_rupees === 'number') return row.amount_rupees
  if (typeof row.amount_minor === 'number') return row.amount_minor / 100
  return 0
}

type BoundStructurePanelProps = {
  structure: AgentBoundStructure
  hrefForTrace?: (traceId: string) => string
  compact?: boolean
  /** Skip outer chrome when parent already shows structure id / status. */
  embedded?: boolean
  /** Parent already showed the policy note / rails — only list bound instructions. */
  omitPolicyDraft?: boolean
  /** Cap the instruction list; operator expands the rest. */
  instructionPreviewLimit?: number
}

/**
 * Shared AgentBoundStructure presentation: policy draft + bound instructions.
 */
export function BoundStructurePanel({
  structure,
  hrefForTrace,
  compact: compactPreview,
  embedded,
  omitPolicyDraft,
  instructionPreviewLimit = 8,
}: BoundStructurePanelProps) {
  const rows =
    (structure.payment_instructions as StructurePaymentRow[] | undefined) ??
    (structure.batch?.payment_instructions as StructurePaymentRow[] | undefined) ??
    []
  const total =
    structure.batch?.intended_rupees ??
    rows.reduce((s, r) => s + amountOf(r), 0)
  const draft = structure.policy_draft
  const note = draft?.note || structure.business_note
  const labels = draft?.control_labels?.length ? draft.control_labels : structure.control_labels
  const [showAllInstructions, setShowAllInstructions] = useState(false)
  const previewCap = compactPreview ? Math.min(instructionPreviewLimit, 6) : instructionPreviewLimit
  const visibleRows =
    showAllInstructions || rows.length <= previewCap
      ? rows
      : rows.slice(0, previewCap)
  const hiddenCount = rows.length - visibleRows.length

  const body = (
    <div className={`space-y-3 ${embedded ? 'p-0' : 'p-4'}`}>
      {omitPolicyDraft ? null : (
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
            Policy bound to agent
          </p>
          <span className="text-[10px] font-semibold text-[#B7791F]">
            Draft — not authority
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-semibold text-[#0B1324]">
          {draft?.label || structure.policy_label || 'Policy draft'}
        </p>
        {note ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#64748B]">{note}</p>
        ) : null}
        <p className="mt-2 text-[12px] text-[#475569]">
          {(draft?.settlement_currency || structure.settlement_currency) ? (
            <>
              <span className="font-semibold text-[#0B1324]">
                {draft?.settlement_currency || structure.settlement_currency}
              </span>
              <span className="mx-1.5 text-[#CBD5E1]">·</span>
            </>
          ) : null}
          {(draft?.approved_rails?.length
            ? draft.approved_rails
            : structure.approved_rails
          )?.join(', ') || 'Rails from policy'}
        </p>
        {labels?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <span
                key={label}
                className="inline-flex max-w-full items-center border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-[#475569]"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-[#94A3B8]">
          {structure.agent_id}
          {structure.compiled_at
            ? ` · ${new Date(structure.compiled_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : ''}
        </p>
      </section>
      )}

      <section className="border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Bound instructions
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">
              {structure.batch?.label || 'Batch'} · {rows.length || structure.batch?.intent_count || 0}{' '}
              intents
            </p>
          </div>
          <p className="text-[15px] font-semibold tabular-nums text-[#0B1324]">
            {formatInr(total)}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-[#94A3B8]">
            Bind this policy to the agent to attach the batch instructions.
          </p>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {visibleRows.map((row) => {
              const rowBody = (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[#0B1324]">{row.human_ref}</p>
                    <p className="truncate text-[11px] text-[#64748B]">
                      {row.beneficiary}
                      {row.rail ? ` · ${row.rail}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-semibold tabular-nums text-[#0B1324]">
                      {formatInr(amountOf(row))}
                    </p>
                  </div>
                </>
              )
              return (
                <li key={row.human_ref + (row.intent_id ?? '')}>
                  {hrefForTrace && row.trace_id ? (
                    <Link
                      href={hrefForTrace(row.trace_id)}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white"
                    >
                      {rowBody}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-3 py-2">{rowBody}</div>
                  )}
                </li>
              )
            })}
            {hiddenCount > 0 ? (
              <li className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowAllInstructions(true)}
                  className="text-[12px] font-semibold text-[#2E5BFF] hover:underline"
                >
                  Show remaining {hiddenCount} instructions
                </button>
              </li>
            ) : null}
            {showAllInstructions && rows.length > previewCap ? (
              <li className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowAllInstructions(false)}
                  className="text-[12px] font-semibold text-[#64748B] hover:underline"
                >
                  Show fewer
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  )

  if (embedded) return body

  return (
    <div className="overflow-hidden rounded-xl border border-[#D8DEE9] bg-white">
      <div className="border-b border-[#EEF2F6] bg-[#F7F8FB] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              AgentBoundStructure
            </p>
            <p className="mt-0.5 font-mono text-[12px] font-semibold text-[#0B1324]">
              {structure.structure_id}
            </p>
          </div>
          <span className="inline-flex h-6 items-center rounded-md bg-[#E7F6F0] px-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#138A63]">
            {structure.status}
          </span>
        </div>
      </div>
      {body}
    </div>
  )
}
