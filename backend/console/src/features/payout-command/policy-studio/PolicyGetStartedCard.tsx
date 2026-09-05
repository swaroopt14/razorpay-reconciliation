'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'zord:policy-get-started-dismissed'

const STEPS = [
  {
    n: 1,
    title: 'Describe the payouts',
    detail: 'Payroll, vendors, cross-border, or marketplace - tell Zord the business case.',
  },
  {
    n: 2,
    title: 'Choose what to protect',
    detail: 'Stop risky changes, ask for approvals on large amounts, keep approved rails only.',
  },
  {
    n: 3,
    title: 'Set who decides',
    detail: 'Who reviews exceptions, and who is allowed to make the policy live.',
  },
] as const

type PolicyGetStartedCardProps = {
  onCreatePolicy?: () => void
}

/** Quiet onboarding - business language, Ask Zord entry. */
export function PolicyGetStartedCard({ onCreatePolicy }: PolicyGetStartedCardProps) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(DISMISS_KEY)
          } catch {
            /* ignore */
          }
          setDismissed(false)
        }}
        className="text-[12px] font-semibold text-[#2563EB] hover:underline"
      >
        Show get started
      </button>
    )
  }

  return (
    <section className="relative border border-[#E2E8F0] bg-white px-5 py-5 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, '1')
          } catch {
            /* ignore */
          }
          setDismissed(true)
        }}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-[18px] text-[#94A3B8] hover:text-[#0B1324]"
        aria-label="Dismiss get started"
      >
        ×
      </button>

      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0B1324]">
        Get started
      </p>
      <span className="mt-1 block h-0.5 w-10 bg-[#2563EB]" aria-hidden />

      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="relative mx-auto h-[140px] w-full max-w-[220px] shrink-0 lg:mx-0">
          <Image
            src="/images/policy-studio-get-started-illustration.png"
            alt=""
            fill
            className="object-contain"
            sizes="220px"
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <ol className="relative flex flex-col gap-5 sm:flex-row sm:gap-0">
            {STEPS.map((step, i) => (
              <li key={step.n} className="relative flex-1 sm:px-2">
                {i < STEPS.length - 1 ? (
                  <span
                    className="absolute left-3 top-3 hidden h-px w-[calc(100%-0.5rem)] border-t border-dashed border-[#CBD5E1] sm:block"
                    aria-hidden
                  />
                ) : null}
                <div className="relative flex gap-3 sm:flex-col sm:gap-2">
                  <span
                    className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      step.n === 1
                        ? 'bg-[#2563EB] text-white'
                        : 'border-2 border-[#CBD5E1] bg-white text-[#64748B]'
                    }`}
                  >
                    {step.n}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0B1324]">{step.title}</p>
                    <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-[#64748B]">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5">
            <button
              type="button"
              onClick={onCreatePolicy}
              className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Ask Zord to draft
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
