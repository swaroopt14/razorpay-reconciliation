'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, UserPlus } from 'lucide-react'
import {
  ADMIN_TABS,
  CONTEXT_OPTIONS,
  DEMO_ACCESS_POLICIES,
  DEMO_ADMIN_TICKETS,
  DEMO_AUDIT,
  DEMO_ROLES,
  DEMO_TEAM,
  ENTERPRISE_ROLES,
  SENSITIVE_ACTIONS,
  WORKSPACE_ADMIN_HEADER,
  type AdminSupportTicket,
  type AdminTabId,
  type AuditEvent,
  type EnterpriseRole,
  type TeamMember,
} from '@/services/payout-command/demo/workspaceAdminDemo'

function tabFromQuery(raw: string | null): AdminTabId {
  if (raw && ADMIN_TABS.some((t) => t.id === raw)) return raw as AdminTabId
  return 'team'
}

function pill(status: string) {
  if (status === 'Active' || status === 'Resolved' || status === 'Open') {
    return 'bg-[#F1F5F9] text-[#0B1324] ring-[#0B1324]/20'
  }
  if (status === 'Suspended' || status === 'Urgent' || status === 'High') {
    return 'bg-[#F1F5F9] text-[#0B1324] ring-[#0B1324]/20'
  }
  if (status === 'Invited' || status === 'Pending' || status === 'Draft' || status === 'Normal') {
    return 'bg-[#F1F5F9] text-[#0B1324] ring-[#0B1324]/20'
  }
  return 'bg-[#F1F5F9] text-[#64748B] ring-[#E2E8F0]'
}

/**
  * Spec 7.18 - Team, Access, Audit, and Support.
  * Credentials live in Developer - not here. Demo reviewer is read-only for destructive actions.
  */
export function WorkspaceAdminSurface() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<AdminTabId>(() => tabFromQuery(searchParams.get('tab')))
  const [team, setTeam] = useState<TeamMember[]>(DEMO_TEAM)
  const [audit, setAudit] = useState<AuditEvent[]>(DEMO_AUDIT)
  const [tickets, setTickets] = useState<AdminSupportTicket[]>(DEMO_ADMIN_TICKETS)
  const [toast, setToast] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<EnterpriseRole>('Reviewer')
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketSeverity, setTicketSeverity] = useState<AdminSupportTicket['severity']>('Normal')
  const [ticketContextIdx, setTicketContextIdx] = useState(0)

  const ycReadonly = useMemo(
    () => Boolean(team.find((m) => m.ycReviewerReadonly)?.ycReviewerReadonly),
    [team],
  )

  useEffect(() => {
    setTab(tabFromQuery(searchParams.get('tab')))
  }, [searchParams])

  function setTabAndUrl(next: AdminTabId) {
    setTab(next)
    router.replace(`/admin?demo=sandbox&tab=${next}`, { scroll: false })
  }

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }

  function guardDestructive(action: string): boolean {
    if (!ycReadonly) return true
    flash(`Demo reviewer account is read-only for destructive actions - cannot ${action}`)
    return false
  }

  function inviteMember() {
    if (!guardDestructive('invite team member')) return
    if (!inviteName.trim() || !inviteEmail.trim()) {
      flash('Name and email are required')
      return
    }
    const member: TeamMember = {
      id: `u_${Date.now()}`,
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
      status: 'Invited',
      lastActive: '-',
    }
    setTeam((prev) => [member, ...prev])
    setAudit((prev) => [
      {
        id: `aud_${Date.now()}`,
        actor: 'Workspace admin',
        action: 'invite user',
        object: member.email,
        reason: `Invite as ${inviteRole}`,
        timestamp: 'Just now',
        before: '-',
        after: `Invited · ${inviteRole}`,
      },
      ...prev,
    ])
    setInviteOpen(false)
    setInviteName('')
    setInviteEmail('')
    flash('Team member invited - role change audited')
  }

  function createRole() {
    if (!guardDestructive('create role')) return
    flash('Create role (sandbox) - draft role opened; activate requires Security admin')
  }

  function exportAudit() {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'zord-workspace-audit-log.json'
    a.click()
    URL.revokeObjectURL(url)
    flash('Exported audit log - actor, action, object, reason, before/after')
  }

  function raiseTicket() {
    if (!ticketSubject.trim()) {
      flash('Add a subject for the support request')
      return
    }
    const ctx = CONTEXT_OPTIONS[ticketContextIdx] ?? CONTEXT_OPTIONS[0]
    const row: AdminSupportTicket = {
      id: `tkt_${Date.now()}`,
      subject: ticketSubject.trim(),
      severity: ticketSeverity,
      status: 'Open',
      contextKind: ctx.kind,
      contextRef: ctx.ref,
      contextHref: ctx.href,
      updated: 'Just now',
      maskedNote: 'Support cannot expose unmasked financial data by default.',
    }
    setTickets((prev) => [row, ...prev])
    setTicketOpen(false)
    setTicketSubject('')
    flash('Support request raised with attached context link')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {WORKSPACE_ADMIN_HEADER.title}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#64748B]">
              {WORKSPACE_ADMIN_HEADER.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ycReadonly ? (
              <span className="rounded-md border border-[#0B1324]/20 bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#0B1324]">
                Demo reviewer · read-only destructive
              </span>
            ) : null}
            <Link
              href="/developer?demo=sandbox&tab=keys"
              className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748B] hover:text-[#0B1324]"
            >
              Credentials → Developer
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1 border-b border-[#E5E7EB]">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabAndUrl(t.id)}
              className={`h-9 px-3 text-[13px] font-semibold ${
                tab === t.id
                  ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                  : 'text-[#64748B] hover:text-[#0B1324]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'team' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  Who can view, approve, seal, dispatch, reveal data, and export proof.
                </p>
                <button
                  type="button"
                  onClick={() => setInviteOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                  Invite team member
                </button>
              </div>

              {inviteOpen ? (
                <div className="border border-[#E5E7EB] bg-white px-4 py-4">
                  <p className="text-[14px] font-semibold text-[#0B1324]">Invite user</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-[12px] font-medium text-[#64748B]">
                      Name
                      <input
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        className="mt-1 h-9 w-full border border-[#E2E8F0] px-3 text-[13px]"
                      />
                    </label>
                    <label className="text-[12px] font-medium text-[#64748B]">
                      Email
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="mt-1 h-9 w-full border border-[#E2E8F0] px-3 text-[13px]"
                      />
                    </label>
                    <label className="text-[12px] font-medium text-[#64748B]">
                      Role
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as EnterpriseRole)}
                        className="mt-1 h-9 w-full border border-[#E2E8F0] bg-white px-3 text-[13px]"
                      >
                        {ENTERPRISE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={inviteMember}
                      className="h-9 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white"
                    >
                      Invite user
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteOpen(false)}
                      className="h-9 px-3 text-[13px] font-semibold text-[#64748B]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                <table className="w-full min-w-[800px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                      {['Name', 'Email', 'Role', 'Status', 'Last active'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((m) => (
                      <tr key={m.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="px-4 py-3 font-semibold text-[#0B1324]">
                          {m.name}
                          {m.ycReviewerReadonly ? (
                            <span className="ml-2 text-[10px] font-semibold text-[#0B1324]">Demo read-only</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[#475569]">{m.email}</td>
                        <td className="px-4 py-3 text-[#0B1324]">{m.role}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${pill(m.status)}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#64748B]">{m.lastActive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'roles' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  Enterprise roles with clear boundaries on sensitive actions.
                </p>
                <button
                  type="button"
                  onClick={createRole}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Create role
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {DEMO_ROLES.map((r) => (
                  <article key={r.id} className="border border-[#E5E7EB] bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[15px] font-semibold text-[#0B1324]">{r.name}</p>
                        <p className="mt-1 text-[12px] text-[#64748B]">{r.description}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#94A3B8]">{r.members} members</span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {SENSITIVE_ACTIONS.map((action) => {
                        const allowed = Boolean(r.sensitive[action])
                        return (
                          <li
                            key={action}
                            className="flex items-center justify-between text-[12px]"
                          >
                            <span className="text-[#475569]">{action}</span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                allowed ? 'bg-[#F1F5F9] text-[#0B1324]' : 'bg-[#F1F5F9] text-[#94A3B8]'
                              }`}
                            >
                              {allowed ? 'Allow' : 'Deny'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'access' ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[#64748B]">
                Access policies enforce sensitive actions. Role changes are audited.
              </p>
              {DEMO_ACCESS_POLICIES.map((p) => (
                <article key={p.id} className="border border-[#E5E7EB] bg-white px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold text-[#0B1324]">{p.name}</p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{p.appliesTo}</p>
                      <p className="mt-2 text-[13px] text-[#475569]">{p.rule}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${pill(p.status)}`}>
                      {p.status}
                    </span>
                  </div>
                </article>
              ))}
              <p className="text-[11px] text-[#94A3B8]">
                API keys and secrets are managed in{' '}
                <Link href="/developer?demo=sandbox&tab=keys" className="font-semibold text-[#2E5BFF] hover:underline">
                  Developer
                </Link>
                , not Workspace administration.
              </p>
            </div>
          ) : null}

          {tab === 'audit' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  Actor · action · object · reason · timestamp · before/after
                </p>
                <button
                  type="button"
                  onClick={exportAudit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324]"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={2} />
                  Export audit log
                </button>
              </div>
              <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                      {['Actor', 'Action', 'Object', 'Reason', 'Timestamp', 'Before', 'After'].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.id} className="border-b border-[#F0F0F0] last:border-0 align-top">
                        <td className="px-3 py-3 text-[12px] text-[#0B1324]">{e.actor}</td>
                        <td className="px-3 py-3 font-semibold text-[#0B1324]">{e.action}</td>
                        <td className="px-3 py-3 font-mono text-[11px]">{e.object}</td>
                        <td className="px-3 py-3 text-[12px] text-[#475569]">{e.reason}</td>
                        <td className="px-3 py-3 text-[12px] text-[#64748B]">{e.timestamp}</td>
                        <td className="px-3 py-3 text-[11px] text-[#64748B]">{e.before}</td>
                        <td className="px-3 py-3 text-[11px] text-[#0B1324]">{e.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'support' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-[#64748B]">
                  New ticket · attach context · severity · status. Context links to the exact object.
                </p>
                <button
                  type="button"
                  onClick={() => setTicketOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white"
                >
                  Raise support request
                </button>
              </div>

              {ticketOpen ? (
                <div className="border border-[#E5E7EB] bg-white px-4 py-4">
                  <p className="text-[14px] font-semibold text-[#0B1324]">New ticket</p>
                  <label className="mt-3 block text-[12px] font-medium text-[#64748B]">
                    Subject
                    <input
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      className="mt-1 h-9 w-full border border-[#E2E8F0] px-3 text-[13px]"
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-[12px] font-medium text-[#64748B]">
                      Severity
                      <select
                        value={ticketSeverity}
                        onChange={(e) =>
                          setTicketSeverity(e.target.value as AdminSupportTicket['severity'])
                        }
                        className="mt-1 h-9 w-full border border-[#E2E8F0] bg-white px-3 text-[13px]"
                      >
                        {['Low', 'Normal', 'High', 'Urgent'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[12px] font-medium text-[#64748B]">
                      Attach context
                      <select
                        value={ticketContextIdx}
                        onChange={(e) => setTicketContextIdx(Number(e.target.value))}
                        className="mt-1 h-9 w-full border border-[#E2E8F0] bg-white px-3 text-[13px]"
                      >
                        {CONTEXT_OPTIONS.map((c, i) => (
                          <option key={c.ref} value={i}>
                            {c.kind} · {c.ref}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-[#94A3B8]">
                    Support cannot expose unmasked financial data by default - attach a link, don&apos;t paste
                    secrets.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={raiseTicket}
                      className="h-9 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white"
                    >
                      Raise support request
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketOpen(false)}
                      className="h-9 px-3 text-[13px] font-semibold text-[#64748B]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {tickets.map((t) => (
                  <article key={t.id} className="border border-[#E5E7EB] bg-white px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold text-[#0B1324]">{t.subject}</p>
                        <p className="mt-1 text-[12px] text-[#64748B]">
                          {t.contextKind} ·{' '}
                          <Link href={t.contextHref} className="font-semibold text-[#2E5BFF] hover:underline">
                            {t.contextRef}
                          </Link>
                        </p>
                        <p className="mt-1.5 text-[11px] text-[#94A3B8]">{t.maskedNote}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${pill(t.severity)}`}>
                          {t.severity}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${pill(t.status)}`}>
                          {t.status}
                        </span>
                        <span className="text-[11px] text-[#94A3B8]">{t.updated}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#0B1324] px-4 py-2 text-[13px] font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
