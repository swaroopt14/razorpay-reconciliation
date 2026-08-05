'use client'

/**
 * Intent drawer — expanded row detail for the Intent Journal.
 * Shows only tokenized banking / payment metadata (no lineage, signals, routing, or evidence UI).
 */

import type { ReactNode } from 'react'

import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import { formatJournalMoney } from './formatJournalMoney'

export function BankingInformationTokensBlock({ detail }: { detail: IntentDetail }) {
  return (
    <Section
      title="Banking (tokenized)"
      subtitle="Masked beneficiary and stable tokens only — no full account numbers or raw payloads."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <TokenRow label="Beneficiary" value={detail.beneficiaryFull} wide />
        <TokenRow label="Beneficiary token" value={detail.beneficiaryToken} mono />
        <TokenRow label="Amount" value={formatJournalMoney(detail.amount, detail.currency)} />
        <TokenRow label="Rail" value={detail.rail} />
        <TokenRow label="Connector" value={detail.connector} wide />
        <TokenRow label="Intent ref" value={detail.intentId} mono />
      </dl>
    </Section>
  )
}

function TokenRow({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</dt>
      <dd
        className={`mt-1 text-[14px] font-medium leading-snug text-[#0f172a] ${mono ? 'font-mono text-[13px]' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#E5E5E5] bg-white p-3.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="mb-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#64748b]">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
