'use client'

import { useRouter } from 'next/navigation'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { ALERT_STRIP_NEON } from '../command-center/AlertStrip'

const SANDBOX_STRIP_BG = '#000000'

/**
 * Sandbox mode strip — same shell + neon treatment as AlertStrip (GREEN).
 */
export function SandboxBanner({ onActivateClick }: { onActivateClick: () => void }) {
  const { mode, canSwitchToLive, liveActivationStatus } = useEnvironment()
  const router = useRouter()
  if (mode !== 'sandbox') return null

  const isInReview = liveActivationStatus === 'in_review'
  const neonGreen = ALERT_STRIP_NEON.GREEN

  return (
    <div
      className={`sticky top-0 z-50 w-full border-b border-white/15 px-4 py-3 text-white sm:px-6 ${neonGreen}`}
      style={{ backgroundColor: SANDBOX_STRIP_BG }}
      role="region"
      aria-label="Sandbox mode"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <span className="sr-only">Sandbox: </span>
          <span
            className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-white backdrop-blur-sm"
            aria-hidden
          >
            Sandbox
          </span>
          <p className="min-w-0 text-[16px] font-semibold leading-snug tracking-[-0.02em]">
            <span className="font-medium">
              You&apos;re testing in a sandbox. Changes you make here don&apos;t affect your live account.
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {isInReview ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/50 bg-amber-500/25 px-3 py-1.5 text-[13px] font-semibold text-amber-50 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_#fde68a]" aria-hidden />
              Activation in review · ~24h
            </span>
          ) : canSwitchToLive ? (
            <button
              type="button"
              onClick={() => router.push('/payout-command-view/today')}
              className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-[#15803d] shadow-sm transition hover:bg-white/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Switch to live account
            </button>
          ) : (
            <>
              <span className="hidden text-[13px] font-medium text-white/90 sm:inline">Activate first to switch</span>
              <button
                type="button"
                onClick={onActivateClick}
                className="rounded-lg bg-white/20 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                title="Complete the activation wizard before you can switch to live mode"
              >
                Activate live account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
