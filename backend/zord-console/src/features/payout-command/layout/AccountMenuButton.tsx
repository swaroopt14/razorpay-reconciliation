'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/hooks'
import { logout } from '@/services/auth'
import { Glyph } from '../shared'

type AccountMenuButtonProps = {
  deskRole: string
  /** Use on dark product top bars. */
  tone?: 'default' | 'onDark'
  /** Square icon button (person mark) instead of initials. */
  iconOnly?: boolean
}

function userInitials(email: string | undefined, name: string | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  if (email?.trim()) return email.trim().slice(0, 2).toUpperCase()
  return 'ZO'
}

export function AccountMenuButton({
  deskRole: _deskRole,
  tone = 'onDark',
  iconOnly = false,
}: AccountMenuButtonProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const initials = userInitials(user?.email, user?.name)
  /** Exact Zord demo identity for the screenshot-matched account card. */
  const displayName = 'Zordnet Operations'
  const displayEmail = 'ops.reviewer@zordnet.com'
  const displayDesk = 'Desk · Ops supervisor'

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayEmail)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [displayEmail])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await logout()
      setOpen(false)
      router.push('/signin')
    } finally {
      setSigningOut(false)
    }
  }, [router])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center text-[12px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          tone === 'onDark'
            ? `rounded-[10px] border border-[#2F2F2F] bg-[#1C1C1C] text-[#D4D4D4] hover:border-[#3A3A3A] hover:bg-[#242424] hover:text-white focus-visible:outline-white/40 ${open ? 'border-[#4A4A4A] bg-[#242424] text-white' : ''}`
            : `rounded-none border border-[#CBD5E1] bg-[#E2E8F0] text-[#0F172A] hover:bg-[#CBD5E1] focus-visible:outline-neutral-400 ${open ? 'border-[#94A3B8]' : ''}`
        }`}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {iconOnly ? (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M5.5 18.5c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          initials
        )}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] cursor-default bg-black/[0.08]"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),22rem)] origin-top-right overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)] animate-[alerts-pop_0.18s_ease-out]"
          >
            <Link
              href="/admin?demo=sandbox&tab=team"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 pb-1 pt-4 transition hover:bg-[#F8FAFC]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E5E7EB] text-[#6B7280]">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M5.5 18.6c1.2-2.9 3.4-4.3 6.5-4.3s5.3 1.4 6.5 4.3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold leading-tight text-[#111827]">
                  {displayName}
                </span>
                <span className="mt-0.5 block truncate text-[14px] text-[#6B7280]">{displayDesk}</span>
              </span>
              <svg className="h-4 w-4 shrink-0 text-[#9CA3AF]" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="m7.5 4.5 6 5.5-6 5.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3.5 py-3">
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#374151]">{displayEmail}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyEmail()}
                  aria-label="Copy email"
                  className="shrink-0 rounded-md p-1 text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827]"
                >
                  <Glyph name="copy" className="h-4 w-4" />
                </button>
                {copied ? <span className="shrink-0 text-[12px] font-medium text-[#059669]">Copied</span> : null}
              </div>
            </div>

            <div className="space-y-0.5 px-2 py-3">
              <Link
                href="/admin?demo=sandbox&tab=team"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#111827] transition hover:bg-[#F8FAFC]"
              >
                <Glyph name="users" className="h-[18px] w-[18px] text-[#4B5563]" />
                Team &amp; Access
              </Link>
              <Link
                href="/admin?demo=sandbox&tab=support"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#111827] transition hover:bg-[#F8FAFC]"
              >
                <Glyph name="support" className="h-[18px] w-[18px] text-[#4B5563]" />
                Support
              </Link>
              <Link
                href="/developer?demo=sandbox&tab=keys"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#111827] transition hover:bg-[#F8FAFC]"
              >
                <Glyph name="key" className="h-[18px] w-[18px] text-[#4B5563]" />
                Developer
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-[#DC2626] transition hover:bg-[#FEF2F2] disabled:opacity-60"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M12.5 6V4.5a1.5 1.5 0 0 0-1.5-1.5H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5V14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 10h9m0 0-2.6-2.6M17 10l-2.6 2.6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {signingOut ? 'Signing out…' : 'Log out'}
              </button>
            </div>

            <div className="border-t border-[#F3F4F6] bg-[#EEF4FF] px-4 py-4">
              <p className="text-[13px] leading-snug text-[#1E3A8A]">
                Run payout ops with confidence. Seal instructions, settle faster, and keep every proof ready.
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <Link
                  href="/developer?demo=sandbox&tab=keys"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center rounded-lg bg-[#2563EB] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#1D4ED8]"
                >
                  Explore Zord APIs
                </Link>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[18px] font-bold text-[#2563EB] shadow-sm">
                  Z
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
