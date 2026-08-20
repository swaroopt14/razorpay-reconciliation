import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Create Payment Request | Zord',
  description: 'Direct payment initiation is not part of live V1.',
}

export default function CreatePaymentPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Live V1</p>
      <h1 className="mt-3 text-[28px] font-bold tracking-tight text-neutral-900">
        Direct payment creation is not available
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
        Live V1 is file-first and non-custodial. Payment instructions are ingested through Intent Engine
        batches, not a console form with sample accounts or unsupported WALLET/CARD rails.
      </p>
      <Link
        href="/payout-command-view/today?dock=grid"
        className="mt-8 inline-flex h-10 items-center rounded-lg bg-neutral-900 px-4 text-[14px] font-medium text-white transition hover:bg-neutral-800"
      >
        Open Intent Journal
      </Link>
    </main>
  )
}
