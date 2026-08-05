'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ZordLogo } from '@/components/ZordLogo'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import {
  DEMO_HOME_HREF,
  DEMO_SMOKE_BATCH_ID,
  DEMO_WORKSPACE_NAME,
  enterDemoSession,
} from '@/services/payout-command/demo/ycDemoConstants'
import { ZordInfrastructureBanner } from '@/features/payout-command/demo/ZordInfrastructureBanner'
import { markSandboxSetupStep, openSandboxSetupPanel } from '@/services/payout-command/sandbox-setup-guide'

/**
 * Spec 7.1 - Enter demo → Operations Overview (`/overview`, Spec 7.2).
 * Establishes a smoke-backed session via /api/auth/demo-login so middleware lets protected routes through.
 */
export default function YcDemoLoginPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enterDemo(guide: boolean) {
    setBusy(true)
    setError(null)
    persistEnvMode('sandbox')
    // Explicit demo entry may keep the populated spine; password /signin never seeds.
    enterDemoSession({ guide, seedUploads: true })

    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || `Demo login failed (${res.status})`)
      }
      markSandboxSetupStep('overview')
      if (guide) openSandboxSetupPanel()
      router.push(guide ? `${DEMO_HOME_HREF}&guide=1` : DEMO_HOME_HREF)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter demo workspace.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FB] px-4 py-8">
      <div className="w-full max-w-[480px] overflow-hidden rounded-md border border-[#D8DEE9] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
        <ZordInfrastructureBanner />

        <div className="px-7 pb-7 pt-6">
          <div className="mb-5 flex items-center gap-3">
            <ZordLogo size="md" variant="light" />
            <div>
              <p className="text-[12px] font-semibold tracking-wide text-[#0B1324]">AREALIS ZORD</p>
              <p className="text-[11px] text-[#64748B]">Sandbox demo</p>
            </div>
          </div>

          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#0B1324]">
            Start the demo
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#64748B]">
            Follow one payout from authorisation to proof. Inspect every object - money-moving actions are
            simulated or need confirmation.
          </p>

          <p className="mt-4 text-[11px] leading-relaxed text-[#94A3B8]">
            {DEMO_WORKSPACE_NAME} · Sandbox · batch{' '}
            <span className="font-mono font-medium text-[#0B1324]">{DEMO_SMOKE_BATCH_ID}</span> · Reviewer
            · no OTP
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
              <p className="mt-1 text-[11px] text-rose-600">
                Ensure smoke is up:{' '}
                <code className="font-mono">cd payout-smoke-simulator && docker compose up -d</code>
              </p>
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => void enterDemo(false)}
              >
                Retry
              </button>
            </div>
          ) : null}

          {/* Pure azure blue (R=0) - no indigo/violet cast */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void enterDemo(false)}
            className="mt-6 w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white transition disabled:opacity-60"
            style={{
              backgroundColor: '#0066FF',
              boxShadow: '0 4px 14px rgba(0, 102, 255, 0.32)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0052CC'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0066FF'
            }}
          >
            {busy ? 'Opening…' : 'Start the demo'}
          </button>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void enterDemo(true)}
              className="rounded-xl border border-[#D8DEE9] bg-white px-3 py-2.5 text-center text-[12px] font-semibold text-[#0B1324] transition hover:border-[#0066FF]/50 hover:bg-[#F7F8FB]"
            >
              Start 3-minute guided demo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void enterDemo(false)}
              className="rounded-xl border border-[#D8DEE9] bg-white px-3 py-2.5 text-center text-[12px] font-semibold text-[#0B1324] transition hover:border-[#0066FF]/50 hover:bg-[#F7F8FB]"
            >
              Explore workspace
            </button>
          </div>

          <p className="mt-6 text-center text-[11px] text-[#64748B]">
            Have credentials?{' '}
            <Link
              href={`/signin?sandbox=1&next=${encodeURIComponent(DEMO_HOME_HREF)}`}
              className="font-semibold hover:underline"
              style={{ color: '#0066FF' }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
