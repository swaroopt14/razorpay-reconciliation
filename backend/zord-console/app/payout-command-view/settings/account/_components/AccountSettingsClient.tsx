'use client'

import { useMemo } from 'react'
import { useSessionAccountProfile } from '@/app/payout-command-view/_components/account/useSessionAccountProfile'

function formatSessionExpiry(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '1 (this browser)'
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function AccountSettingsClient() {
  const { profile, loading } = useSessionAccountProfile()

  const workspaceValue = useMemo(() => {
    if (!profile) return loading ? 'Loading…' : '—'

    const parts = [profile.tenantName, profile.workspaceCode ? `(${profile.workspaceCode})` : null].filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
    if (profile.tenantId) return profile.tenantId
    return '—'
  }, [loading, profile])

  const sessionValue = useMemo(() => {
    if (!profile?.sessionExpiresAt) return loading ? 'Loading…' : '1 (this browser)'
    return `Active until ${formatSessionExpiry(profile.sessionExpiresAt)}`
  }, [loading, profile?.sessionExpiresAt])

  const twoFactorValue = loading
    ? 'Loading…'
    : profile?.mfaEnabled === true
      ? 'Configured'
      : profile?.mfaEnabled === false
        ? 'Not configured'
        : 'Unknown'

  return (
    <div className="space-y-4">
      <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <header className="border-b border-[#E5E5E5] px-5 py-3">
          <p className="text-[17px] font-semibold text-[#0f172a]">Profile</p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Name" value={profile?.name || (loading ? 'Loading…' : '—')} />
          <Field label="Email" value={profile?.email || (loading ? 'Loading…' : '—')} />
          <Field label="Workspace" value={workspaceValue} />
          <Field label="Tenant ID" value={profile?.tenantId || (loading ? 'Loading…' : '—')} />
          <Field label="Role" value={profile?.role || (loading ? 'Loading…' : '—')} />
        </div>
      </article>

      <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <header className="border-b border-[#E5E5E5] px-5 py-3">
          <p className="text-[17px] font-semibold text-[#0f172a]">Security</p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Password" value="•••••••••" action="Change password" />
          <Field label="2FA" value={twoFactorValue} action={profile?.mfaEnabled ? 'Manage 2FA' : 'Set up 2FA'} />
          <Field label="Current session" value={sessionValue} />
        </div>
      </article>

      <article className="overflow-hidden rounded-[16px] border border-rose-200 bg-rose-50/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <header className="border-b border-rose-200 px-5 py-3">
          <p className="text-[17px] font-semibold text-rose-700">Danger zone</p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Delete account" value="Removes all sandbox data and revokes keys." action="Delete" destructive />
        </div>
      </article>
    </div>
  )
}

function Field({
  label,
  value,
  action,
  destructive,
}: {
  label: string
  value: string
  action?: string
  destructive?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</p>
        <p className="mt-0.5 text-[16px] text-[#0f172a]">{value}</p>
      </div>
      {action ? (
        <button
          type="button"
          className={`rounded-[6px] border px-2.5 py-1 text-[15px] font-medium transition ${
            destructive
              ? 'border-rose-300 bg-white text-rose-700 hover:bg-rose-100'
              : 'border-[#E5E5E5] bg-white text-[#475569] hover:bg-[#fafafa]'
          }`}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}
