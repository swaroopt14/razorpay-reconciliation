import type { ReactNode } from 'react'
import Link from 'next/link'
import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'

/**
 * Settings shell — left sidebar with sections, right pane renders the active page.
 * Sections that aren't wired this sprint are visible-but-disabled so the IA reads complete.
 */

const SECTIONS = [
  { id: 'account', label: 'Account', href: '/payout-command-view/settings/account', enabled: true },
  { id: 'api-keys', label: 'API keys', href: '/payout-command-view/settings/api-keys', enabled: true },
  {
    id: 'support',
    label: 'Support',
    href: '/payout-command-view/today?dock=support',
    enabled: true,
  },
  { id: 'webhooks', label: 'Webhooks', href: '#', enabled: false },
  { id: 'billing', label: 'Billing', href: '#', enabled: false },
  { id: 'team', label: 'Team', href: '#', enabled: false },
  { id: 'audit', label: 'Audit log', href: '#', enabled: false },
] as const

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className="payout-command-console min-h-screen bg-[#ebebeb] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:flex-row lg:px-8">
        {/* Left sidebar */}
        <aside className="shrink-0 lg:w-[220px]">
          <Link
            href="/payout-command-view/today"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#64748b] transition hover:text-[#0f172a]"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m7 3-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to console
          </Link>
          <h1 className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-[#0f172a]">Settings</h1>

          <nav className="mt-5 space-y-0.5">
            {SECTIONS.map((s) =>
              s.enabled ? (
                <Link
                  key={s.id}
                  href={s.href}
                  className="flex items-center justify-between rounded-[8px] px-3 py-1.5 text-[13px] font-medium text-[#475569] transition hover:bg-white hover:text-[#0f172a]"
                >
                  {s.label}
                </Link>
              ) : (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-[8px] px-3 py-1.5 text-[13px] text-[#94a3b8]"
                >
                  <span>{s.label}</span>
                  <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Soon
                  </span>
                </div>
              ),
            )}
          </nav>
        </aside>

        {/* Right pane */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  )
}
