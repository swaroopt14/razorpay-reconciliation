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
  return 'Z'
}

export function AccountMenuButton({
  deskRole,
  tone = 'onDark',
  iconOnly = false,
}: AccountMenuButtonProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const initials = userInitials(user?.email, user?.name)
  const displayEmail = user?.email?.trim() || 'Signed in'
  const displayTenant =
    user?.tenantName?.trim() || user?.workspaceCode?.trim() || user?.tenantId?.trim() || user?.tenant?.trim() || ''

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
            className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),17.5rem)] origin-top-right overflow-hidden rounded-none border border-neutral-200/90 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] animate-[alerts-pop_0.18s_ease-out]"
          >
            <div className="border-b border-neutral-100 px-4 py-3.5">
              <p className="truncate text-[14px] font-semibold text-neutral-900">{displayEmail}</p>
              {displayTenant ? (
                <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500">{displayTenant}</p>
              ) : null}
              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                Desk · {deskRole}
              </p>
            </div>

            <div className="p-1.5">
              <Link
                href="/admin?demo=sandbox&tab=team"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                <Glyph name="users" className="h-4 w-4 text-neutral-500" />
                Team & Access
              </Link>
              <Link
                href="/admin?demo=sandbox&tab=support"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                <Glyph name="support" className="h-4 w-4 text-neutral-500" />
                Support
              </Link>
              <Link
                href="/connections?demo=sandbox"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                <Glyph name="link" className="h-4 w-4 text-neutral-500" />
                Connections
              </Link>
            </div>

            <div className="border-t border-neutral-100 p-1.5">
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-semibold text-[#0B1324] transition hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                <Glyph name="arrow-up-right" className="h-4 w-4 rotate-45 text-[#0B1324]" />
                {signingOut ? 'Signing out…' : 'Log out'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
