'use client'

import type { FinanceObservation } from '@/services/payout-command/prod-api/financeTypes'

export type LifecycleStep = {
  id: string
  label: string
  state: 'done' | 'warn' | 'missing' | 'current'
}

export function buildLifecycleSteps(opts: {
  observations?: FinanceObservation[]
  providerStatus?: string
  reason?: string
  hasSettlement?: boolean
  hasRefund?: boolean
  hasBank?: boolean
}): LifecycleStep[] {
  const obs = opts.observations ?? []
  const statuses = new Set(
    obs.map((o) => `${o.canonical_status} ${o.provider_status}`.toLowerCase()),
  )
  const has = (token: string) => [...statuses].some((s) => s.includes(token))
  const provider = (opts.providerStatus ?? '').toLowerCase()

  const created = has('created') || obs.length > 0 || Boolean(provider)
  const authorized = has('authoriz') || provider === 'authorized' || provider === 'captured' || provider === 'failed'
  const failed = provider === 'failed' || has('failed')
  const captured = provider === 'captured' || has('captured')
  const bank = opts.hasBank || has('bank')
  const settlement = opts.hasSettlement === true
  const refund = opts.hasRefund === true

  const steps: LifecycleStep[] = [
    { id: 'created', label: 'Created', state: created ? 'done' : 'missing' },
    { id: 'authorized', label: 'Authorized', state: authorized ? 'done' : 'missing' },
  ]

  if (failed) {
    steps.push({ id: 'failed', label: 'Failed', state: 'done' })
  } else if (captured) {
    steps.push({ id: 'captured', label: 'Captured', state: 'done' })
  } else {
    steps.push({ id: 'outcome', label: opts.providerStatus || 'Open', state: 'current' })
  }

  if (bank) {
    steps.push({
      id: 'bank',
      label: failed ? 'Bank movement detected' : 'Bank credited',
      state: failed ? 'warn' : 'done',
    })
  } else {
    steps.push({ id: 'bank', label: 'No bank movement', state: 'missing' })
  }

  steps.push({
    id: 'settlement',
    label: settlement ? 'Settlement found' : 'No settlement found',
    state: settlement ? 'done' : 'missing',
  })
  steps.push({
    id: 'refund',
    label: refund ? 'Refund issued' : 'No refund found',
    state: refund ? 'done' : 'missing',
  })

  return steps
}

export function PaymentLifecycleStrip({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="space-y-0" aria-label="Payment lifecycle">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        const dot =
          step.state === 'done'
            ? 'bg-[#16A34A]'
            : step.state === 'warn'
              ? 'bg-[#D97706]'
              : step.state === 'current'
                ? 'bg-[#2E5BFF]'
                : 'bg-[#CBD5E1]'
        const label =
          step.state === 'warn'
            ? 'text-[#B45309]'
            : step.state === 'missing'
              ? 'text-[#94A3B8]'
              : 'text-[#0F172A]'
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
              {last ? null : <span className="my-0.5 w-px flex-1 bg-[#E2E8F0]" />}
            </div>
            <p className={`pb-4 text-[13px] font-medium ${label}`}>{step.label}</p>
          </li>
        )
      })}
    </ol>
  )
}
