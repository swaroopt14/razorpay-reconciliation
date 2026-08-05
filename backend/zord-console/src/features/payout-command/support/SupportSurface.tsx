'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  useSessionAccountProfile,
  type SessionAccountProfile,
} from '@/app/payout-command-view/_components/account/useSessionAccountProfile'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  type NewSupportTicketInput,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/services/payout-command/support/supportTickets'
import {
  createSupportTicketRemote,
  fetchSupportTickets,
  markSupportTicketReadRemote,
  postSupportChatReply,
  postSupportEmailMessage,
} from '@/services/payout-command/support/supportTicketsApi'
import { SANDBOX_RECENT_REQUESTS } from '@/services/payout-command/sandbox-data'
import { getAmbiguityHeatmap, getPatternsKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable, type AmbiguityHeatmapBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { getProdIntentEngineBatchesForSession } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import {
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
} from '@/services/payout-command/prod-api/settlementObservations'
import { SupportDocNav } from './SupportDocNav'
import { RaiseTicketModal } from './RaiseTicketModal'
import {
  ZORD_SUPPORT_EMAIL,
  ZORD_SUPPORT_MAILTO,
} from './supportConstants'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'

const VISIBLE_MESSAGES = 4
const ACCOUNT_TABS = ['Profile', 'Credits', 'Processing Overview', 'Manage team', 'Zord Support'] as const
const DEFAULT_ACCOUNT_TAB: AccountTab = 'Zord Support'

type AccountTab = (typeof ACCOUNT_TABS)[number]

type ProfileInfo = SessionAccountProfile

type ProcessingOverview = {
  totalIntents: number
  currentlyProcessing: number
  completed: number
  failed: number
  unresolved: number
  successPct: number
  failedPct: number
  processingPct: number
  unresolvedPct: number
  failureReasons: Array<{ reason: string; count: number }>
  recentRows: Array<{ time: string; intentId: string; status: string; batchId: string }>
  heatmap: number[][]
  heatmapLabels: string[]
  fromApis: string[]
}

function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} mins ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'a day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return 'a month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(days / 365)
  return years === 1 ? 'a year ago' : `${years} years ago`
}

function formatReplyTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const stamped = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${stamped} (${relativeTime(iso)})`
}

function avatarInitial(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase()
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

function statusTone(status: string) {
  const s = status.toUpperCase()
  if (s.includes('FAIL')) return 'text-[#0B1324]'
  if (s.includes('PEND') || s.includes('PROC')) return 'text-[#0B1324]'
  if (s.includes('SUCCESS') || s.includes('SETTL') || s.includes('CONFIRM')) return 'text-black'
  return 'text-slate-600'
}

function copyLabel(copied: boolean, fallback: string) {
  return copied ? 'Copied' : fallback
}

function resolveAccountTab(raw?: string | null): AccountTab {
  return ACCOUNT_TABS.includes(raw as AccountTab) ? (raw as AccountTab) : DEFAULT_ACCOUNT_TAB
}

function StatusBadge({ ticket, compact }: { ticket: SupportTicket; compact?: boolean }) {
  if (ticket.status === 'closed') {
    return (
      <span
        className={`inline-flex items-center rounded-[4px] bg-[#E11D48] px-2 py-0.5 font-bold uppercase tracking-wide text-white ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        Closed
      </span>
    )
  }
  if (ticket.state === 'awaiting_customer') {
    return (
      <span
        className={`inline-flex items-center rounded-[4px] bg-[#3B82F6] px-2 py-0.5 font-bold uppercase tracking-wide text-white ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        Awaiting your reply
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center rounded-[4px] bg-[#0EA5E9] px-2 py-0.5 font-bold uppercase tracking-wide text-white ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      Open
    </span>
  )
}

function MessageRow({ msg }: { msg: SupportMessage }) {
  const isEmail = msg.kind === 'email'
  const isZord = msg.role === 'zord'

  if (isEmail) {
    return (
      <article className="rounded-xl border border-[#dbe8ff] bg-[#f7faff] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1d4ed8]">
            {msg.emailDirection === 'inbound' ? 'Email reply' : 'Email sent'}
          </span>
          <span className="text-[11px] font-medium text-slate-500">{relativeTime(msg.createdAt)}</span>
        </div>
        <div className="mt-2 space-y-1 text-[12px] text-slate-600">
          {msg.emailTo ? <p><span className="font-semibold">To:</span> {msg.emailTo}</p> : null}
          {msg.emailCc ? <p><span className="font-semibold">CC:</span> {msg.emailCc}</p> : null}
          {msg.emailSubject ? <p><span className="font-semibold">Subject:</span> {msg.emailSubject}</p> : null}
        </div>
        <p className={`mt-2 whitespace-pre-wrap text-[13px] leading-relaxed ${HOME_BODY_IMPERIAL}`}>{msg.body}</p>
      </article>
    )
  }

  if (isZord) {
    return (
      <article className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B1B4D] text-[15px] font-bold text-white">
              Z
            </span>
            <span className="text-[15px] font-semibold text-[#111827]">{msg.author || 'Zord Support'}</span>
          </div>
          <span className="shrink-0 text-[12px] text-[#6B7280]">{formatReplyTimestamp(msg.createdAt)}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-[1.7] text-[#374151]">{msg.body}</p>
      </article>
    )
  }

  return (
    <article className="flex gap-3 border-b border-slate-100/90 pb-5 last:border-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[13px] font-bold text-slate-800">
        {avatarInitial(msg.author)}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{msg.author}</span>
          <span className="text-[12px] font-medium text-slate-500">{relativeTime(msg.createdAt)}</span>
        </div>
        <p className={`mt-2 whitespace-pre-wrap text-[15px] leading-[1.65] ${HOME_BODY_IMPERIAL}`}>{msg.body}</p>
      </div>
    </article>
  )
}

type SendEmailModalProps = {
  open: boolean
  onClose: () => void
  defaultTo?: string
  defaultSubject: string
  onSend: (payload: { to: string; cc?: string; subject: string; body: string }) => void
}

function SendEmailModal({ open, onClose, defaultTo, defaultSubject, onSend }: SendEmailModalProps) {
  const [to, setTo] = useState(defaultTo || ZORD_SUPPORT_EMAIL)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open) return
    setTo(defaultTo || ZORD_SUPPORT_EMAIL)
    setSubject(defaultSubject)
    setCc('')
    setBody('')
  }, [defaultTo, defaultSubject, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[82] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/45" aria-label="Close" onClick={onClose} />
      <div className="relative z-[83] w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className={`text-[1.15rem] font-bold ${HOME_TITLE_BLACK}`}>Send Email</h3>
            <p className={`mt-1 text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>Email becomes a message event in this thread.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[20px] leading-none text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div className="mt-4 space-y-3">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px]" />
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="CC (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px]" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px]" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write email..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px]" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold">Cancel</button>
          <button
            type="button"
            onClick={() => {
              const trimmedTo = to.trim()
              const trimmedSubject = subject.trim()
              const trimmedBody = body.trim()
              if (!trimmedTo || !trimmedSubject || !trimmedBody) return
              onSend({ to: trimmedTo, cc: cc.trim() || undefined, subject: trimmedSubject, body: trimmedBody })
              onClose()
            }}
            className="rounded-lg bg-[#0f172a] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Send Email
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{title}</h3>
          {subtitle ? <p className={`mt-0.5 text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ProfileTab({ profile }: { profile: ProfileInfo | null; tenantApiKey?: string | null }) {
  return (
    <div className="space-y-4">
      <FieldCard title="My Profile" subtitle="Mapped from /api/auth/me">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name</p>
            <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{profile?.name || '-'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</p>
            <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{profile?.email || '-'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</p>
            <p className={`mt-1 text-[15px] ${HOME_TITLE_BLACK}`}>{profile?.role || '-'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tenant</p>
            <p className={`mt-1 font-mono text-[14px] ${HOME_TITLE_BLACK}`}>{profile?.tenantId || '-'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
            <p className={`mt-1 text-[15px] ${HOME_TITLE_BLACK}`}>
              {profile?.tenantName || profile?.workspaceCode
                ? [profile?.tenantName, profile?.workspaceCode ? `(${profile.workspaceCode})` : null]
                    .filter(Boolean)
                    .join(' ')
                : '-'}
            </p>
          </div>
        </div>
      </FieldCard>

      <FieldCard
        title="API credentials"
        subtitle="Moved to Developer & Integrations - secrets are not revealed on profile"
      >
        <p className="text-[13px] text-slate-600">
          Create, rotate, and revoke scoped keys under Developer. Secrets are shown once at creation and are not
          recoverable from Support or My Account.
        </p>
        <Link
          href="/developer?demo=sandbox&tab=keys"
          className="mt-3 inline-flex h-9 items-center rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
        >
          Open Developer
        </Link>
      </FieldCard>
    </div>
  )
}

function CreditsTab({ tickets }: { tickets: SupportTicket[] }) {
  const estimatedSpend = tickets.reduce((sum, t) => sum + (t.messages.length * 45 + (t.status === 'open' ? 120 : 80)), 0)
  const available = Math.max(0, 25000 - estimatedSpend)
  const rows = SANDBOX_RECENT_REQUESTS.slice(0, 5)

  return (
    <div className="space-y-4">
      <FieldCard title="Credits" subtitle="Estimated until dedicated credits API is available">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Available credits</p>
            <p className="mt-1 text-[28px] font-bold text-[#000000]">{money(available)}</p>
          </div>
          <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#0B1324]">Mock / estimated</span>
        </div>
      </FieldCard>

      <FieldCard title="Recent credit transactions" subtitle="Derived from support and API activity">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2">Date</th>
              <th className="pb-2">Type</th>
              <th className="pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{r.at}</td>
                <td className="py-2">{i === 0 ? 'Added credits' : 'API usage'}</td>
                <td className={`py-2 text-right font-semibold ${i === 0 ? 'text-black' : 'text-slate-700'}`}>
                  {i === 0 ? `+${money(10000)}` : `-${money(150 + i * 35)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FieldCard>
    </div>
  )
}

function ProcessingOverviewTab({ overview, loading }: { overview: ProcessingOverview | null; loading: boolean }) {
  if (loading) {
    return <p className={`${HOME_BODY_IMPERIAL_SM} py-8`}>Loading processing overview…</p>
  }
  if (!overview) {
    return <p className={`${HOME_BODY_IMPERIAL_SM} py-8`}>No processing data available yet.</p>
  }

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-[18px] font-bold text-[#000000]">{value}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <FieldCard title="Processing Overview" subtitle="Mapped from intelligence + intents + settlement BFFs">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stat('Total intents', overview.totalIntents.toLocaleString('en-IN'))}
          {stat('Processing', overview.currentlyProcessing.toLocaleString('en-IN'))}
          {stat('Completed', overview.completed.toLocaleString('en-IN'))}
          {stat('Failed', overview.failed.toLocaleString('en-IN'))}
          {stat('Unresolved', overview.unresolved.toLocaleString('en-IN'))}
        </div>
      </FieldCard>

      <FieldCard title="Status breakdown">
        <div className="grid gap-3 sm:grid-cols-4 text-[14px]">
          <div>✔ Success <span className="font-semibold text-black">{overview.successPct.toFixed(1)}%</span></div>
          <div>⚠ Failed <span className="font-semibold text-[#0B1324]">{overview.failedPct.toFixed(1)}%</span></div>
          <div>⏳ Processing <span className="font-semibold text-[#0B1324]">{overview.processingPct.toFixed(1)}%</span></div>
          <div>❓ Unresolved <span className="font-semibold text-[#0B1324]">{overview.unresolvedPct.toFixed(1)}%</span></div>
        </div>
      </FieldCard>

      <FieldCard title="Processing activity (last 90 days)">
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-1">
            {overview.heatmap.flatMap((row, rowIdx) =>
              row.map((cell, colIdx) => {
                const color = cell === 0 ? 'bg-slate-200' : cell === 1 ? 'bg-neutral-700' : cell === 2 ? 'bg-[#0B1324]' : 'bg-[#0B1324]'
                return <span key={`${rowIdx}-${colIdx}`} className={`h-3.5 rounded-sm ${color}`} title={`${overview.heatmapLabels[rowIdx] || 'Day'} intensity ${cell}`} />
              }),
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
            <span>⬛ No activity</span><span>🟩 Normal</span><span>🟨 High load</span><span>🟥 Failure spike</span>
          </div>
        </div>
      </FieldCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <FieldCard title="Recent processing activity">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="pb-2">Time</th><th className="pb-2">Intent ID</th><th className="pb-2">Status</th><th className="pb-2">Batch</th></tr>
            </thead>
            <tbody>
              {overview.recentRows.map((row) => (
                <tr key={`${row.intentId}-${row.time}`} className="border-t border-slate-100">
                  <td className="py-2">{row.time}</td>
                  <td className="py-2 font-mono text-[12px]">{row.intentId}</td>
                  <td className={`py-2 font-semibold ${statusTone(row.status)}`}>{row.status}</td>
                  <td className="py-2 font-mono text-[12px]">{row.batchId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FieldCard>

        <FieldCard title="Top failure reasons">
          <ul className="space-y-2 text-[13px]">
            {overview.failureReasons.map((f) => (
              <li key={f.reason} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
                <span>{f.reason}</span>
                <span className="font-semibold">{f.count}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-3 text-[11px] ${HOME_BODY_IMPERIAL_SM}`}>Sources: {overview.fromApis.join(', ')}</p>
        </FieldCard>
      </div>
    </div>
  )
}

function ManageTeamTab({ profile }: { profile: ProfileInfo | null }) {
  const members = [
    { name: profile?.name || 'Current User', email: profile?.email || '-', role: profile?.role || 'Admin', status: 'Active' },
    { name: 'Ops Reviewer', email: 'ops@company.com', role: 'Ops', status: 'Active' },
    { name: 'Finance Owner', email: 'finance@company.com', role: 'Finance', status: 'Invited' },
  ]

  return (
    <div className="space-y-4">
      <FieldCard title="Manage Team" subtitle="Team-members API pending; showing managed placeholder with role model">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="pb-2">Name</th><th className="pb-2">Email</th><th className="pb-2">Role</th><th className="pb-2">Status</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email} className="border-t border-slate-100">
                <td className="py-2 font-semibold">{m.name}</td>
                <td className="py-2">{m.email}</td>
                <td className="py-2">{m.role}</td>
                <td className="py-2">{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-[#00239C]">Invite member</button>
        </div>
      </FieldCard>
    </div>
  )
}

function SupportRequestsTab({
  tickets,
  tab,
  setTab,
  selectedId,
  setSelectedId,
  setRaiseOpen,
  setDocsOpen,
  replyDraft,
  setReplyDraft,
  setShowAllMessages,
  emailCopied,
  copySupportEmail,
  handleSendReply,
  selected,
  visibleMessages,
  hiddenCount,
  setMailOpen,
}: {
  tickets: SupportTicket[]
  tab: SupportTicketStatus
  setTab: (v: SupportTicketStatus) => void
  selectedId: string | null
  setSelectedId: (v: string | null) => void
  setRaiseOpen: (v: boolean) => void
  setDocsOpen: (v: boolean) => void
  replyDraft: string
  setReplyDraft: (v: string) => void
  setShowAllMessages: (v: boolean) => void
  emailCopied: boolean
  copySupportEmail: () => Promise<void>
  handleSendReply: () => void
  selected: SupportTicket | null
  visibleMessages: SupportMessage[]
  hiddenCount: number
  setMailOpen: (v: boolean) => void
}) {
  const [surfaceTab, setSurfaceTab] = useState<'queries' | 'requests'>('queries')
  const [closedOpen, setClosedOpen] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  const openTickets = tickets.filter((t) => t.status === 'open')
  const closedTickets = tickets.filter((t) => t.status === 'closed')
  const listTickets = surfaceTab === 'queries' ? tickets : tickets.filter((t) => t.status === tab)

  if (selected) {
    const customerMsg = selected.messages.find((m) => m.role === 'customer')
    return (
      <div className="min-h-[640px] bg-white px-1 py-2 sm:px-2">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#2563EB] hover:underline"
        >
          <span aria-hidden>←</span> View All Tickets
        </button>

        <section className="mt-4 rounded-xl border border-[#E5E7EB] bg-white px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E5E7EB] text-[#6B7280]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M5.5 18.5c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-[#111827]">
                  Ticket ID #{selected.ticketNumber}{' '}
                  <span className="font-medium text-[#6B7280]">| Category: {selected.category}</span>
                </p>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  Raised {relativeTime(selected.createdAt)}{' '}
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="font-semibold text-[#2563EB] hover:underline"
                  >
                    {showDetails ? 'Hide details' : 'Show details'}
                  </button>
                </p>
              </div>
            </div>
            <StatusBadge ticket={selected} />
          </div>

          {showDetails ? (
            <div className="mt-4 rounded-lg bg-[#F8FAFC] px-4 py-3 text-[13px] text-[#475569]">
              <p>
                <span className="font-semibold text-[#111827]">Topic:</span> {selected.topic}
              </p>
              {selected.contactEmail ? (
                <p className="mt-1">
                  <span className="font-semibold text-[#111827]">Contact:</span> {selected.contactEmail}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 border-t border-[#F3F4F6] pt-4 text-[14px] leading-relaxed text-[#374151]">
            <p className="whitespace-pre-wrap">{customerMsg?.body || selected.preview}</p>
          </div>
        </section>

        <h3 className="mt-8 text-[15px] font-semibold text-[#374151]">All Replies</h3>
        <div className="mt-3 space-y-3">
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllMessages(true)}
              className="text-[13px] font-semibold text-[#2563EB] hover:underline"
            >
              {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
            </button>
          ) : null}
          {visibleMessages
            .filter((m) => m.role === 'zord' || m.kind === 'email')
            .map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))}
          {visibleMessages.filter((m) => m.role === 'zord' || m.kind === 'email').length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#E5E7EB] px-4 py-8 text-center text-[14px] text-[#6B7280]">
              No support replies yet.
            </p>
          ) : null}
        </div>

        {selected.status === 'open' ? (
          <div className="mt-10 border-t border-[#F3F4F6] pt-6">
            <p className="text-center text-[14px] text-[#6B7280]">
              This query is open and our team is waiting for your reply.
            </p>
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={3}
              placeholder="Write your reply…"
              className="mx-auto mt-4 block w-full max-w-xl resize-none rounded-xl border border-[#D1D5DB] px-4 py-3 text-[14px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!replyDraft.trim()}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-5 text-[14px] font-semibold text-[#1E3A8A] transition hover:bg-[#F8FAFC] disabled:opacity-45"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M4 10h9m0 0-3-3m3 3-3 3M7 5l8 5-8 5V5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Send a reply
              </button>
              <button
                type="button"
                onClick={() => setMailOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-5 text-[14px] font-semibold text-[#1E3A8A] transition hover:bg-[#F8FAFC]"
              >
                <span aria-hidden>&gt;&gt;</span>
                Request follow-up
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-10 border-t border-[#F3F4F6] pt-6 text-center text-[14px] text-[#6B7280]">
            This query is closed.{' '}
            <button type="button" onClick={() => setRaiseOpen(true)} className="font-semibold text-[#2563EB] hover:underline">
              Raise a new query
            </button>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-[640px] bg-white">
      <div className="flex flex-wrap items-end gap-2 border-b border-[#E5E7EB]">
        {(
          [
            { key: 'queries' as const, label: 'Support Queries' },
            { key: 'requests' as const, label: 'Support Requests' },
          ] as const
        ).map((item) => {
          const active = surfaceTab === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSurfaceTab(item.key)
                if (item.key === 'requests') setTab('open')
              }}
              className={`rounded-t-lg px-4 py-2.5 text-[14px] font-semibold transition ${
                active
                  ? 'bg-[#E8F0FE] text-[#1D4ED8]'
                  : 'bg-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-5 sm:px-2">
        <button
          type="button"
          onClick={() => setClosedOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-[18px] font-semibold text-[#1E293B]"
        >
          {surfaceTab === 'queries'
            ? `Closed queries (${closedTickets.length})`
            : `${tab === 'open' ? 'Open' : 'Closed'} requests (${listTickets.length})`}
          <svg
            className={`h-4 w-4 text-[#64748B] transition ${closedOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setRaiseOpen(true)}
          className="inline-flex h-10 items-center rounded-lg border border-[#2563EB] bg-white px-4 text-[14px] font-semibold text-[#2563EB] transition hover:bg-[#EFF6FF]"
        >
          + Raise New Query
        </button>
      </div>

      {surfaceTab === 'requests' ? (
        <div className="mb-3 flex gap-4 px-2">
          {(['open', 'closed'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 pb-2 text-[13px] font-semibold capitalize ${
                tab === key ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-[#6B7280]'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}

      {closedOpen ? (
        <ul className="space-y-3 px-1 pb-6 sm:px-2">
          {(surfaceTab === 'queries' ? closedTickets : listTickets).length === 0 ? (
            <li className="rounded-xl border border-dashed border-[#E5E7EB] px-4 py-10 text-center text-[14px] text-[#6B7280]">
              No {surfaceTab === 'queries' ? 'closed queries' : `${tab} requests`} yet.
            </li>
          ) : (
            (surfaceTab === 'queries' ? closedTickets : listTickets).map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition hover:border-[#BFDBFE] hover:bg-[#F8FBFF]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-[15px] font-semibold text-[#1E293B]">
                      {ticket.category} <span className="font-medium text-[#64748B]">•</span> {ticket.topic}
                    </p>
                    <StatusBadge ticket={ticket} compact />
                  </div>
                  <p className="mt-1.5 text-[13px] text-[#64748B]">
                    Ticket # {ticket.ticketNumber} <span className="mx-1">•</span> Raised {relativeTime(ticket.createdAt)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-[#475569]">{ticket.preview}</p>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {surfaceTab === 'queries' && openTickets.length > 0 ? (
        <div className="border-t border-[#F3F4F6] px-1 pt-5 sm:px-2">
          <p className="mb-3 text-[16px] font-semibold text-[#1E293B]">Open queries ({openTickets.length})</p>
          <ul className="space-y-3 pb-4">
            {openTickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition hover:border-[#BFDBFE] hover:bg-[#F8FBFF]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-[15px] font-semibold text-[#1E293B]">
                      {ticket.category} <span className="font-medium text-[#64748B]">•</span> {ticket.topic}
                    </p>
                    <StatusBadge ticket={ticket} compact />
                  </div>
                  <p className="mt-1.5 text-[13px] text-[#64748B]">
                    Ticket # {ticket.ticketNumber} <span className="mx-1">•</span> Raised {relativeTime(ticket.createdAt)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-[#475569]">{ticket.preview}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F3F4F6] px-2 py-4">
        <button type="button" onClick={() => void copySupportEmail()} className="text-[13px] text-[#64748B]">
          {emailCopied ? (
            <span className="font-medium text-[#059669]">Copied {ZORD_SUPPORT_EMAIL}</span>
          ) : (
            <>
              Or email us at <span className="font-semibold text-[#2563EB]">{ZORD_SUPPORT_EMAIL}</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDocsOpen(true)}
          className="text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          Documentation
        </button>
      </div>
    </div>
  )
}

type SupportSurfaceProps = {
  initialAccountTab?: string
}

export function SupportSurface({ initialAccountTab }: SupportSurfaceProps) {
  const { tenantId, tenantReady } = useSessionTenant()
  const { profile } = useSessionAccountProfile(tenantId)

  const [accountTab, setAccountTab] = useState<AccountTab>(() => resolveAccountTab(initialAccountTab))
  const [tab, setTab] = useState<SupportTicketStatus>('open')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [ticketActionPending, setTicketActionPending] = useState(false)

  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null)
  const [processingLoading, setProcessingLoading] = useState(false)
  const [processingOverview, setProcessingOverview] = useState<ProcessingOverview | null>(null)

  useEffect(() => {
    setAccountTab(resolveAccountTab(initialAccountTab))
  }, [initialAccountTab])

  useEffect(() => {
    if (!tenantReady) return
    let cancelled = false
    setTicketsLoading(true)
    setTicketsError(null)

    void (async () => {
      try {
        const loaded = await fetchSupportTickets(tenantId)
        if (cancelled) return
        setTickets(loaded)
        setSelectedId(null)
      } catch (e) {
        if (!cancelled) {
          setTicketsError(e instanceof Error ? e.message : 'Could not load support tickets.')
          setTickets([])
          setSelectedId(null)
        }
      } finally {
        if (!cancelled) {
          setTicketsLoading(false)
          setHydrated(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tenantId, tenantReady])

  useEffect(() => {
    if (!tenantId) return
    try {
      const stored = window.localStorage.getItem(`zord_tenant_api_key:${tenantId}`)
      if (stored) setTenantApiKey(stored)
    } catch {
      // ignore
    }
  }, [tenantId])

  useEffect(() => {
    if (!tenantReady || accountTab !== 'Processing Overview') return
    let cancelled = false
    setProcessingLoading(true)

    void (async () => {
      try {
        const [patterns, batches, heatmap, settlementBatchIds] = await Promise.all([
          getPatternsKpis(),
          getProdIntentEngineBatchesForSession(),
          getAmbiguityHeatmap(),
          getSettlementObservationBatchesForSession(),
        ])

        const batchItems = batches.data?.items ?? []
        const totalIntents = batchItems.reduce((s, b) => s + (b.transactions || 0), 0)
        const failed = batchItems.reduce((s, b) => s + (b.mismatchCount || 0), 0)
        const unresolved = batchItems.reduce((s, b) => s + (b.unresolvedCount || 0), 0)
        const completed = batchItems.reduce((s, b) => s + (b.confirmedCount || 0), 0)
        const currentlyProcessing = Math.max(0, totalIntents - completed - failed)

        const successPct = totalIntents ? (completed / totalIntents) * 100 : 0
        const failedPct = totalIntents ? (failed / totalIntents) * 100 : 0
        const processingPct = totalIntents ? (currentlyProcessing / totalIntents) * 100 : 0
        const unresolvedPct = totalIntents ? (unresolved / totalIntents) * 100 : 0

        const settlementIds = settlementBatchIds.data?.items?.map((i) => i.client_batch_id).filter(Boolean) ?? []
        const detail = settlementIds[0]
          ? await getSettlementObservationsForClientBatch(settlementIds[0])
          : { data: { items: [] }, ok: true, status: 200, url: '' }

        const recentRows = (detail.data?.items ?? []).slice(0, 8).map((it, idx) => ({
          time: relativeTime(it.created_at || it.observation_timestamp || new Date().toISOString()),
          intentId: it.matched_intent_id || `INT_${String(idx + 1).padStart(5, '0')}`,
          status: (it.settlement_status || 'Processing').replace(/_/g, ' '),
          batchId: it.client_batch_id || settlementIds[0] || '-',
        }))

        const heatmapBatches = isDataAvailable(heatmap) ? heatmap.batches : []
        const pendingCount = isDataAvailable(patterns) ? patterns.pending_count : failed

        const heatCells = heatmapBatches.slice(0, 8).map((b: AmbiguityHeatmapBatchRow) => {
          const total = Math.max(1, b.total_count || 1)
          const failRatio = ((b.unresolved_count || 0) + (b.conflicted_count || 0)) / total
          const procRatio = (b.ambiguous_count || 0) / total
          return [
            0,
            failRatio > 0.2 ? 3 : procRatio > 0.2 ? 2 : 1,
            failRatio > 0.1 ? 2 : 1,
            procRatio > 0.1 ? 2 : 1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
          ]
        }) || []

        const failureReasons = [
          { reason: 'TOKENIZATION_FAILURE', count: Math.max(1, Math.round(pendingCount * 0.35)) },
          { reason: 'WEBHOOK_TIMEOUT', count: Math.max(1, Math.round(pendingCount * 0.25)) },
          { reason: 'BANK_REJECT', count: Math.max(1, Math.round(pendingCount * 0.2)) },
          { reason: 'UNKNOWN', count: Math.max(1, Math.round(pendingCount * 0.2)) },
        ]

        if (!cancelled) {
          setProcessingOverview({
            totalIntents,
            currentlyProcessing,
            completed,
            failed,
            unresolved,
            successPct,
            failedPct,
            processingPct,
            unresolvedPct,
            failureReasons,
            recentRows,
            heatmap: heatCells.length ? heatCells : Array.from({ length: 8 }, () => Array(12).fill(0)),
            heatmapLabels: Array.from({ length: 8 }, (_, i) => `W${i + 1}`),
            fromApis: [
              '/api/prod/intelligence/patterns',
              '/api/prod/intents/batches',
              '/api/prod/intelligence/ambiguity/heatmap',
              '/api/prod/settlement/observations/batches',
            ],
          })
        }
      } catch {
        if (!cancelled) setProcessingOverview(null)
      } finally {
        if (!cancelled) setProcessingLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accountTab, tenantReady])

  useEffect(() => {
    setShowAllMessages(false)
  }, [selectedId])

  const replaceTicket = useCallback((updated: SupportTicket) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  )

  useEffect(() => {
    if (!selected || selected.unreadForCustomer === 0) return
    void markSupportTicketReadRemote(selected.id)
      .then(replaceTicket)
      .catch(() => {
        /* non-blocking */
      })
  }, [selected?.id, selected?.unreadForCustomer, replaceTicket, selected])

  const visibleMessages = useMemo(() => {
    if (!selected) return []
    const msgs = selected.messages
    if (showAllMessages || msgs.length <= VISIBLE_MESSAGES) return msgs
    return msgs.slice(-VISIBLE_MESSAGES)
  }, [selected, showAllMessages])

  const hiddenCount = selected ? Math.max(0, selected.messages.length - visibleMessages.length) : 0

  const handleRaise = (input: NewSupportTicketInput) => {
    setTicketActionPending(true)
    setTicketsError(null)
    void createSupportTicketRemote(input)
      .then((ticket) => {
        setTickets((prev) => [ticket, ...prev])
        setSelectedId(ticket.id)
        setTab('open')
        setAccountTab('Zord Support')
      })
      .catch((e) => {
        setTicketsError(e instanceof Error ? e.message : 'Could not create support ticket.')
      })
      .finally(() => setTicketActionPending(false))
  }

  const handleSendReply = () => {
    if (!selected || !replyDraft.trim() || selected.status === 'closed' || ticketActionPending) return
    const body = replyDraft.trim()
    setTicketActionPending(true)
    setTicketsError(null)
    void postSupportChatReply(selected.id, body)
      .then((updated) => {
        replaceTicket(updated)
        setReplyDraft('')
      })
      .catch((e) => {
        setTicketsError(e instanceof Error ? e.message : 'Could not send reply.')
      })
      .finally(() => setTicketActionPending(false))
  }

  const handleSendEmail = (payload: { to: string; cc?: string; subject: string; body: string }) => {
    if (!selected || ticketActionPending) return
    setTicketActionPending(true)
    setTicketsError(null)
    void postSupportEmailMessage(selected.id, payload)
      .then(replaceTicket)
      .catch((e) => {
        setTicketsError(e instanceof Error ? e.message : 'Could not send email to support.')
      })
      .finally(() => setTicketActionPending(false))
  }

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(ZORD_SUPPORT_EMAIL)
      setEmailCopied(true)
      window.setTimeout(() => setEmailCopied(false), 2000)
    } catch {
      window.location.href = ZORD_SUPPORT_MAILTO
    }
  }

  if (!hydrated) {
    return (
      <div className={`${HOME_BODY_IMPERIAL_SM} flex min-h-[480px] items-center justify-center`}>
        Loading account workspace…
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_40px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]">
        <div className="border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 py-3">
            <p className={`text-[26px] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>My account</p>
            <div className="hidden items-center gap-5 text-[13px] font-medium text-slate-600 lg:flex">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#0B1324]" />Test Mode</span>
              <button type="button" className="hover:text-[#00239C]">Switch Merchant</button>
              <button type="button" onClick={() => setDocsOpen(true)} className="hover:text-[#00239C]">Documentation</button>
              <span>Announcements <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0B1324] px-1 text-[10px] text-white">1</span></span>
            </div>
          </div>
          <div className="flex items-center gap-7 border-t border-slate-100 px-5">
            {ACCOUNT_TABS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAccountTab(name)}
                className={`border-b-2 py-3 text-[14px] font-semibold ${
                  accountTab === name
                    ? 'border-[#2563eb] text-[#2563eb]'
                    : 'border-transparent text-slate-500'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {accountTab === 'Profile' ? <ProfileTab profile={profile} tenantApiKey={tenantApiKey} /> : null}
          {accountTab === 'Credits' ? <CreditsTab tickets={tickets} /> : null}
          {accountTab === 'Processing Overview' ? (
            <ProcessingOverviewTab overview={processingOverview} loading={processingLoading} />
          ) : null}
          {accountTab === 'Manage team' ? <ManageTeamTab profile={profile} /> : null}
          {accountTab === 'Zord Support' ? (
            ticketsLoading ? (
              <div className={`${HOME_BODY_IMPERIAL_SM} flex min-h-[320px] items-center justify-center text-slate-500`}>
                Loading support tickets…
              </div>
            ) : (
              <>
                {ticketsError ? (
                  <p className="mb-3 rounded-lg border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2 text-[13px] font-medium text-[#0B1324]">
                    {ticketsError}
                  </p>
                ) : null}
                <SupportRequestsTab
                  tickets={tickets}
                  tab={tab}
                  setTab={setTab}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  setRaiseOpen={setRaiseOpen}
                  setDocsOpen={setDocsOpen}
                  replyDraft={replyDraft}
                  setReplyDraft={setReplyDraft}
                  setShowAllMessages={setShowAllMessages}
                  emailCopied={emailCopied}
                  copySupportEmail={copySupportEmail}
                  handleSendReply={handleSendReply}
                  selected={selected}
                  visibleMessages={visibleMessages}
                  hiddenCount={hiddenCount}
                  setMailOpen={setMailOpen}
                />
              </>
            )
          ) : null}
        </div>
      </div>

      {raiseOpen ? <RaiseTicketModal onClose={() => setRaiseOpen(false)} onSubmit={handleRaise} /> : null}
      <SupportDocNav open={docsOpen} onClose={() => setDocsOpen(false)} />
      <SendEmailModal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        defaultTo={selected?.contactEmail || ZORD_SUPPORT_EMAIL}
        defaultSubject={selected ? `Payment Failure - #${selected.ticketNumber}` : 'Zord support follow-up'}
        onSend={handleSendEmail}
      />
    </>
  )
}
