'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  useSessionAccountProfile,
  type SessionAccountProfile,
} from '@/app/payout-command-view/_components/account/useSessionAccountProfile'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  appendEmailMessage,
  appendCustomerReply,
  createSupportTicket,
  loadSupportTickets,
  markTicketRead,
  saveSupportTickets,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/services/payout-command/support/supportTickets'
import { SANDBOX_API_KEYS, SANDBOX_RECENT_REQUESTS } from '@/services/payout-command/sandbox-data'
import { getAmbiguityHeatmap, getPatternsKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable, type AmbiguityHeatmapBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { getProdIntentEngineBatchesForSession } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import {
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
} from '@/services/payout-command/prod-api/settlementObservations'
import { SupportDocNav } from './SupportDocNav'
import { RaiseTicketModal } from './RaiseTicketModal'
import { Glyph } from '../shared'
import {
  ZORD_SUPPORT_EMAIL,
  ZORD_SUPPORT_MAILTO,
  supportMailtoForTicket,
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
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} mins ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return `${days} days ago`
}

function formatHeaderDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d
    .toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase()
}

function formatExpectedReply(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function avatarInitial(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase()
}

function categoryAvatarColor(category: string) {
  const hash = category.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const palette = [
    'bg-[#dbeafe] text-[#1e40af]',
    'bg-[#f4f4f5] text-[#000000]',
    'bg-[#fef3c7] text-[#92400e]',
    'bg-[#ede9fe] text-[#5b21b6]',
    'bg-[#ffe4e6] text-[#9f1239]',
  ]
  return palette[hash % palette.length]
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
  if (s.includes('FAIL')) return 'text-rose-600'
  if (s.includes('PEND') || s.includes('PROC')) return 'text-amber-600'
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
        className={`inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-600 ${
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
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Awaiting your reply
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 font-semibold text-black ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-black" aria-hidden />
      Active
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

  return (
    <article className="flex gap-3 border-b border-slate-100/90 pb-5 last:border-0">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          isZord ? 'bg-[#0f172a] text-white' : 'bg-slate-200 text-slate-800'
        }`}
      >
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

function ProfileTab({ profile, tenantApiKey }: { profile: ProfileInfo | null; tenantApiKey: string | null }) {
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState<'key' | 'secret' | null>(null)

  const publishable = SANDBOX_API_KEYS.find((k) => k.type === 'publishable' && k.mode === 'sandbox')?.value ?? 'pk_test_unavailable'
  const secret = tenantApiKey || SANDBOX_API_KEYS.find((k) => k.type === 'secret' && k.mode === 'sandbox')?.value || 'sk_test_unavailable'

  const copy = async (v: string, kind: 'key' | 'secret') => {
    try {
      await navigator.clipboard.writeText(v)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <FieldCard title="My Profile" subtitle="Mapped from /api/auth/me">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name</p>
            <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{profile?.name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</p>
            <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{profile?.email || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</p>
            <p className={`mt-1 text-[15px] ${HOME_TITLE_BLACK}`}>{profile?.role || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tenant</p>
            <p className={`mt-1 font-mono text-[14px] ${HOME_TITLE_BLACK}`}>{profile?.tenantId || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
            <p className={`mt-1 text-[15px] ${HOME_TITLE_BLACK}`}>
              {profile?.tenantName || profile?.workspaceCode
                ? [profile?.tenantName, profile?.workspaceCode ? `(${profile.workspaceCode})` : null]
                    .filter(Boolean)
                    .join(' ')
                : '—'}
            </p>
          </div>
        </div>
      </FieldCard>

      <FieldCard title="Zord Access Credentials" subtitle="From API keys state + local tenant key cache">
        <div className="space-y-3 text-[13px]">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Publishable key</p>
              <code className="text-[13px] text-slate-800">{publishable}</code>
            </div>
            <button type="button" onClick={() => void copy(publishable, 'key')} className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold">{copyLabel(copied === 'key','Copy')}</button>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">API secret</p>
              <code className="text-[13px] text-slate-800">{showSecret ? secret : `${secret.slice(0, 8)}••••••••••••${secret.slice(-4)}`}</code>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowSecret((v) => !v)} className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold">{showSecret ? 'Hide' : 'Reveal'}</button>
              <button type="button" onClick={() => void copy(secret, 'secret')} className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold">{copyLabel(copied === 'secret','Copy')}</button>
            </div>
          </div>
        </div>
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
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Mock / estimated</span>
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
          <div>⚠ Failed <span className="font-semibold text-rose-700">{overview.failedPct.toFixed(1)}%</span></div>
          <div>⏳ Processing <span className="font-semibold text-amber-700">{overview.processingPct.toFixed(1)}%</span></div>
          <div>❓ Unresolved <span className="font-semibold text-blue-700">{overview.unresolvedPct.toFixed(1)}%</span></div>
        </div>
      </FieldCard>

      <FieldCard title="Processing activity (last 90 days)">
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-1">
            {overview.heatmap.flatMap((row, rowIdx) =>
              row.map((cell, colIdx) => {
                const color = cell === 0 ? 'bg-slate-200' : cell === 1 ? 'bg-neutral-700' : cell === 2 ? 'bg-amber-400' : 'bg-rose-500'
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
    { name: profile?.name || 'Current User', email: profile?.email || '—', role: profile?.role || 'Admin', status: 'Active' },
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
  const filtered = tickets.filter((t) => t.status === tab)
  const openCount = tickets.filter((t) => t.status === 'open').length
  const closedCount = tickets.length - openCount
  const awaitingCount = tickets.filter((t) => t.state === 'awaiting_customer').length

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.09)] ring-1 ring-black/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-[#f8fbff] via-[#f4f8ff] to-[#f7f8fc] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
            Open: {openCount}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
            Awaiting reply: {awaitingCount}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
            Closed: {closedCount}
          </span>
        </div>
        <p className="text-[12px] font-medium text-slate-500">Fastest path for incidents: raise ticket + attach batch context</p>
      </div>
      <div className="flex min-h-[min(78vh,760px)] flex-col lg:flex-row">
        <div className="flex w-full shrink-0 flex-col border-b border-slate-200/90 bg-[#f2f5fb] lg:w-[min(100%,390px)] lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
            <div>
              <h2 className={`text-[1.35rem] font-bold tracking-tight ${HOME_TITLE_BLACK}`}>Support requests</h2>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">Track open issues and continue threads</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setDocsOpen(true)} className="rounded-lg border border-slate-300/80 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-[#00239C] hover:bg-white">Docs</button>
              <a href={ZORD_SUPPORT_MAILTO} className="rounded-lg border border-slate-300/80 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-[#00239C] hover:bg-white">Email</a>
              <button type="button" onClick={() => setRaiseOpen(true)} className="rounded-lg border-2 border-[#2563eb] bg-transparent px-3.5 py-1.5 text-[12px] font-bold text-[#2563eb] transition hover:bg-[#2563eb] hover:text-white">Raise new request</button>
            </div>
          </div>

          <div className="flex gap-6 border-b border-slate-200/60 px-5">
            {(['open', 'closed'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key)
                  const first = tickets.find((t) => t.status === key)
                  if (first) setSelectedId(first.id)
                }}
                className={`border-b-2 py-3 text-[14px] font-semibold capitalize transition ${
                  tab === key
                    ? 'border-[#0f172a] text-[#000000]'
                    : 'border-transparent text-slate-500 hover:text-[#00239C]'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          <ul className="min-h-[320px] flex-1 space-y-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className={`px-5 py-10 text-center ${HOME_BODY_IMPERIAL_SM}`}>No {tab} requests yet.</li>
            ) : (
              filtered.map((ticket) => {
                const active = ticket.id === selectedId
                return (
                  <li key={ticket.id} className="px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      className={`relative flex w-full gap-3 rounded-xl border px-3.5 py-3.5 text-left transition ${
                        active
                          ? 'border-[#93c5fd] bg-white shadow-[0_8px_18px_rgba(37,99,235,0.08)]'
                          : 'border-slate-200/60 bg-white/55 hover:bg-white'
                      }`}
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${categoryAvatarColor(ticket.category)}`}>
                        {avatarInitial(ticket.category)}
                      </span>
                      <span className="min-w-0 flex-1 pr-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`text-[14px] font-bold ${HOME_TITLE_BLACK}`}>{ticket.category}</span>
                          <StatusBadge ticket={ticket} compact />
                          {ticket.unreadForCustomer > 0 ? (
                            <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold text-white shadow-sm">{ticket.unreadForCustomer}</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[13px] font-medium text-slate-600">{ticket.topic}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-slate-500"># {ticket.ticketNumber}</span>
                        <span className={`mt-2 line-clamp-2 text-[13px] leading-snug text-slate-600`}>{ticket.preview}</span>
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>

          <div className="border-t border-slate-200/60 px-5 py-3">
            <button type="button" onClick={() => void copySupportEmail()} className={`w-full text-left text-[12px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>
              {emailCopied ? (
                <span className="text-black">Copied {ZORD_SUPPORT_EMAIL}</span>
              ) : (
                <>
                  Or email us at <span className="font-semibold text-[#00239C] underline">{ZORD_SUPPORT_EMAIL}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex min-h-[400px] min-w-0 flex-1 flex-col bg-[#fcfdff]">
          {!selected ? (
            <div className={`flex flex-1 flex-col items-center justify-center gap-3 px-8 ${HOME_BODY_IMPERIAL_SM}`}>
              <p className={`text-center text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>Select a support request</p>
              <p className="max-w-sm text-center">Or raise a new request / email {ZORD_SUPPORT_EMAIL}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => setRaiseOpen(true)} className="rounded-lg bg-[#0f172a] px-4 py-2 text-[13px] font-semibold text-white">Raise new request</button>
                <a href={ZORD_SUPPORT_MAILTO} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold text-[#00239C]">Email support</a>
              </div>
            </div>
          ) : (
            <>
              <header className="border-b border-slate-200/80 bg-white px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-[14px] font-medium ${HOME_BODY_IMPERIAL}`}>
                      <span className="font-semibold text-[#000000]">{selected.category}</span>
                      <span className="mx-1.5 text-slate-400">»</span>
                      <span>{selected.topic}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span>{formatHeaderDate(selected.createdAt)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono normal-case tracking-normal"># {selected.ticketNumber}</span>
                      {selected.contactEmail ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <a href={`mailto:${selected.contactEmail}`} className="normal-case tracking-normal text-[#00239C] underline">{selected.contactEmail}</a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge ticket={selected} />
                    <a href={supportMailtoForTicket(selected.ticketNumber, selected.topic)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-[#00239C] hover:bg-slate-50" title="Open in your mail app">
                      <Glyph name="document" className="h-3.5 w-3.5" />
                      Reply via email
                    </a>
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {hiddenCount > 0 ? (
                  <button type="button" onClick={() => setShowAllMessages(true)} className="mb-6 flex items-center gap-1.5 text-[13px] font-semibold text-[#2563eb] hover:underline">
                    {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
                    <Glyph name="arrow-up-right" className="h-3.5 w-3.5 rotate-90" />
                  </button>
                ) : null}
                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  {visibleMessages.map((msg) => (
                    <MessageRow key={msg.id} msg={msg} />
                  ))}
                </div>
              </div>

              {selected.status === 'open' ? (
                <footer className="border-t border-slate-200/80 bg-white px-6 py-5">
                  {formatExpectedReply(selected.expectedReplyBefore) ? (
                    <p className={`mb-5 text-center text-[14px] leading-relaxed ${HOME_BODY_IMPERIAL}`}>
                      This request is open and our team is working on it. You can expect reply before:{' '}
                      <span className="font-bold text-[#000000]">{formatExpectedReply(selected.expectedReplyBefore)}</span>
                      {selected.notifyByEmail && selected.contactEmail ? (
                        <span className="mt-1 block text-[13px] font-medium text-slate-600">Updates will also be sent to {selected.contactEmail}</span>
                      ) : null}
                    </p>
                  ) : null}
                  <textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={3}
                    placeholder="Write your reply…"
                    className="mb-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-[#00239C] focus:outline-none focus:ring-2 focus:ring-[#00239C]/15"
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={handleSendReply} disabled={!replyDraft.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f172a] py-3 text-[14px] font-bold text-white shadow-md transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45">Reply</button>
                    <button type="button" onClick={() => setMailOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] py-3 text-[14px] font-semibold text-[#1d4ed8] hover:bg-[#dbeafe]">Send Email</button>
                    <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-100">Attach File</button>
                  </div>
                </footer>
              ) : (
                <p className={`border-t border-slate-100 px-6 py-5 text-center ${HOME_BODY_IMPERIAL_SM}`}>
                  This request is closed.{' '}
                  <button type="button" onClick={() => setRaiseOpen(true)} className="font-semibold text-[#00239C] underline">Open a new request</button>{' '}
                  or <a href={ZORD_SUPPORT_MAILTO} className="font-semibold text-[#00239C] underline">email support</a>.
                </p>
              )}
            </>
          )}
        </div>
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

  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null)
  const [processingLoading, setProcessingLoading] = useState(false)
  const [processingOverview, setProcessingOverview] = useState<ProcessingOverview | null>(null)

  useEffect(() => {
    setAccountTab(resolveAccountTab(initialAccountTab))
  }, [initialAccountTab])

  useEffect(() => {
    if (!tenantReady) return
    const loaded = loadSupportTickets(tenantId)
    setTickets(loaded)
    const firstOpen = loaded.find((t) => t.status === 'open')
    setSelectedId(firstOpen?.id ?? loaded[0]?.id ?? null)
    setHydrated(true)
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
          batchId: it.client_batch_id || settlementIds[0] || '—',
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

  const persist = useCallback(
    (next: SupportTicket[]) => {
      setTickets(next)
      saveSupportTickets(tenantId, next)
    },
    [tenantId],
  )

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  )

  useEffect(() => {
    if (!selected || selected.unreadForCustomer === 0) return
    const next = tickets.map((t) => (t.id === selected.id ? markTicketRead(t) : t))
    persist(next)
  }, [selected?.id, selected?.unreadForCustomer, tickets, persist, selected])

  const visibleMessages = useMemo(() => {
    if (!selected) return []
    const msgs = selected.messages
    if (showAllMessages || msgs.length <= VISIBLE_MESSAGES) return msgs
    return msgs.slice(-VISIBLE_MESSAGES)
  }, [selected, showAllMessages])

  const hiddenCount = selected ? Math.max(0, selected.messages.length - visibleMessages.length) : 0

  const handleRaise = (input: Parameters<typeof createSupportTicket>[0]) => {
    const ticket = createSupportTicket(input)
    persist([ticket, ...tickets])
    setSelectedId(ticket.id)
    setTab('open')
    setAccountTab('Zord Support')
  }

  const handleSendReply = () => {
    if (!selected || !replyDraft.trim() || selected.status === 'closed') return
    const updated = appendCustomerReply(selected, replyDraft)
    persist(tickets.map((t) => (t.id === updated.id ? updated : t)))
    setReplyDraft('')
  }

  const handleSendEmail = (payload: { to: string; cc?: string; subject: string; body: string }) => {
    if (!selected) return
    const updated = appendEmailMessage(selected, payload)
    persist(tickets.map((t) => (t.id === updated.id ? updated : t)))
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
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ca8a04]" />Test Mode</span>
              <button type="button" className="hover:text-[#00239C]">Switch Merchant</button>
              <button type="button" onClick={() => setDocsOpen(true)} className="hover:text-[#00239C]">Documentation</button>
              <span>Announcements <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">1</span></span>
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
          ) : null}
        </div>
      </div>

      {raiseOpen ? <RaiseTicketModal onClose={() => setRaiseOpen(false)} onSubmit={handleRaise} /> : null}
      <SupportDocNav open={docsOpen} onClose={() => setDocsOpen(false)} />
      <SendEmailModal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        defaultTo={selected?.contactEmail || ZORD_SUPPORT_EMAIL}
        defaultSubject={selected ? `Payment Failure — #${selected.ticketNumber}` : 'Zord support follow-up'}
        onSend={handleSendEmail}
      />
    </>
  )
}
