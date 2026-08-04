'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'zord:batch-get-started-dismissed'

const STEPS = [
  {
    n: 1,
    title: 'Upload obligation file',
    detail: 'Drop your payout CSV or spreadsheet. Preview rows and fix validation before creating draft intents.',
  },
  {
    n: 2,
    title: 'Upload settlement confirmation',
    detail: 'Add the bank or PSP confirmation for the same batch once draft intents exist.',
  },
] as const

type BatchGetStartedCardProps = {
  onScrollToUpload?: () => void
}

/**
  * Minimal onboarding card - replaces the dense sample/demo strip on Batch Command Center.
  */
export function BatchGetStartedCard({ onScrollToUpload }: BatchGetStartedCardProps) {
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
            src="/images/batch-get-started-illustration.png"
            alt=""
            fill
            className="object-contain"
            sizes="220px"
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <ol className="relative flex flex-col gap-6 sm:flex-row sm:gap-0">
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
                      step.n === 1 ? 'bg-[#2563EB] text-white' : 'border-2 border-[#CBD5E1] bg-white text-[#64748B]'
                    }`}
                  >
                    {step.n}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0B1324]">{step.title}</p>
                    <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[#64748B]">{step.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                onScrollToUpload?.()
                document.getElementById('batch-intake-step-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Start upload
            </button>
            <a
              href="/samples/demo_intents_20.csv"
              download
              className="text-[13px] font-semibold text-[#2563EB] hover:underline"
            >
              Sample obligation file
            </a>
            <a
              href="/samples/demo_settlement_exact.csv"
              download
              className="text-[13px] font-semibold text-[#2563EB] hover:underline"
            >
              Sample settlement file
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
