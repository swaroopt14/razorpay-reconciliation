'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchAgents,
  fetchActions,
  listAgentStructures,
  type AgentBoundStructure,
  type ControlPlaneActionSummary,
} from '@/services/protocol/controlPlaneClient'
import {
  CROSS_BORDER_AGENT_ID,
  CROSS_BORDER_TRACE_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import { ControlPlaneHeader, CopyChip, ProtocolJsonPanel } from './ProtocolChrome'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'

/* ── Agent role derivation ──────────────────────────────────────────────── */

type AgentRole = 'Financial Action Agent' | 'Dispatch Coordination Agent' | 'Lifecycle Observer Agent' | 'Resolution Agent'

const ROLE_BY_ID: Record<string, AgentRole> = {
  agt_treasury_eu_04: 'Financial Action Agent',
  agt_dispatch_coord_01: 'Dispatch Coordination Agent',
  agt_lifecycle_obs_01: 'Lifecycle Observer Agent',
  agt_resolution_01: 'Resolution Agent',
}

function agentRole(agent: Record<string, unknown>): AgentRole {
  const id = String(agent.agent_id ?? '')
  if (ROLE_BY_ID[id]) return ROLE_BY_ID[id]
  const purpose = String(agent.purpose ?? '').toLowerCase()
  if (purpose.includes('dispatch')) return 'Dispatch Coordination Agent'
  if (purpose.includes('observer') || purpose.includes('lifecycle')) return 'Lifecycle Observer Agent'
  if (purpose.includes('resolution')) return 'Resolution Agent'
  return 'Financial Action Agent'
}

function agentShortPurpose(agent: Record<string, unknown>): string {
  const role = agentRole(agent)
  switch (role) {
    case 'Financial Action Agent': return 'Supplier payout proposals'
    case 'Dispatch Coordination Agent': return 'Pre-dispatch route coordination'
    case 'Lifecycle Observer Agent': return 'Post-dispatch evidence monitoring'
    case 'Resolution Agent': return 'Exception investigation & remediation'
  }
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

type Tab = 'overview' | 'capabilities' | 'policy' | 'identity' | 'mcp' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'OVERVIEW' },
  { key: 'capabilities', label: 'CAPABILITIES' },
  { key: 'policy', label: 'POLICY' },
  { key: 'identity', label: 'IDENTITY' },
  { key: 'mcp', label: 'MCP / A2A' },
  { key: 'history', label: 'HISTORY' },
]

/* ── Tiny helpers ───────────────────────────────────────────────────────── */

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#D8DEE9] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{title}</p>
        {badge ? (
          <span className="inline-flex rounded-full bg-[#E7F6F0] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#138A63]">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12px] font-medium text-[#64748B]">{label}</span>
      <span className={`text-right text-[13px] text-[#0B1324] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function Badge({ color, children }: { color: 'green' | 'blue' | 'purple' | 'amber' | 'red'; children: ReactNode }) {
  const cls =
    color === 'green' ? 'bg-[#E7F6F0] text-[#138A63]'
    : color === 'blue' ? 'bg-[#E8EEFF] text-[#2E5BFF]'
    : color === 'purple' ? 'bg-[#F3E8FF] text-[#6D4AFF]'
    : color === 'amber' ? 'bg-[#F8F1E3] text-[#B7791F]'
    : 'bg-[#F8E8E7] text-[#C2413B]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${cls}`}>
      {children}
    </span>
  )
}

function ChipList({ items, color = 'blue' }: { items: string[]; color?: 'blue' | 'green' | 'purple' }) {
  if (!items.length) return <span className="text-[12px] text-[#94A3B8]">—</span>
  const dot = color === 'blue' ? 'bg-[#2E5BFF]' : color === 'green' ? 'bg-[#138A63]' : 'bg-[#6D4AFF]'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-[12px] text-[#0B1324]">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {item}
        </span>
      ))}
    </div>
  )
}

function PolicyStatusBadge({ status }: { status?: string }) {
  const s = (status ?? '').toUpperCase()
  if (s === 'PUBLISHED' || s === 'ATTACHED' || s === 'DRAFT_ATTACHED') return <Badge color="blue">PUBLISHED</Badge>
  if (s === 'DRAFTED' || s === 'DRAFT') return <Badge color="purple">DRAFTED — NOT AUTHORITY</Badge>
  if (s === 'VERIFIED') return <Badge color="green">VERIFIED</Badge>
  if (s === 'INVALID') return <Badge color="red">INVALID</Badge>
  return <Badge color="amber">{s || 'UNKNOWN'}</Badge>
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function AgentRegistrySurface() {
  return (
    <UploadGate title="No payment obligations yet">
      <AgentRegistryBody />
    </UploadGate>
  )
}

function AgentRegistryBody() {
  const { data, error, loading } = useProtocolQuery('agents', fetchAgents)
  const actionsQuery = useProtocolQuery('actions', fetchActions)
  const agents = useMemo(() => (data?.items ?? []) as Record<string, unknown>[], [data])
  const actions = useMemo(() => (actionsQuery.data?.items ?? []) as ControlPlaneActionSummary[], [actionsQuery.data])

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [structures, setStructures] = useState<AgentBoundStructure[]>([])
  const [search, setSearch] = useState('')
  const [envFilter, setEnvFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')

  const agent = useMemo(
    () => agents.find((a) => a.agent_id === selectedAgentId) ?? agents[0] ?? null,
    [agents, selectedAgentId],
  )

  // Fetch structures for the selected agent
  useEffect(() => {
    const agentId = String(agent?.agent_id ?? '')
    if (!agentId) return
    let cancelled = false
    void listAgentStructures(agentId)
      .then((res) => {
        if (!cancelled) setStructures(res.items ?? [])
      })
      .catch(() => {
        if (cancelled) return
        /* Smoke offline — read structure data from Policy Studio session so the Policy tab still shows user's note. */
        try {
          const storedId = sessionStorage.getItem('zord_struct_attach_id') || ''
          const storedNote = sessionStorage.getItem('zord_struct_business_note') || ''
          const storedLabels = sessionStorage.getItem('zord_struct_control_labels') || ''
          const storedLabel = sessionStorage.getItem('zord_struct_policy_label') || 'Enterprise default'
          const storedRails = sessionStorage.getItem('zord_struct_approved_rails') || 'NEFT,RTGS,IMPS'
          const storedCurrency = sessionStorage.getItem('zord_struct_settlement_currency') || 'INR'
          const labels = storedLabels ? storedLabels.split('||') : ['Stop if the payee details change', 'Second approval above ₹5L', 'Approved domestic rails only (NEFT, RTGS, IMPS)', 'Accept only from the payroll file source']
          const rails = storedRails.split(',')
          const note = storedNote || 'Release policy for domestic supplier payouts. Dual approval required above ₹50,000. Approved rails: NEFT, RTGS, IMPS.'
          const mockStructure: AgentBoundStructure = {
            structure_id: storedId || `abs_mock_${agentId}`,
            status: 'ATTACHED',
            business_note: note,
            control_labels: labels,
            policy_pack_id: 'enterprise-default',
            policy_label: storedLabel,
            approved_rails: rails,
            settlement_currency: storedCurrency,
            policy_rules: [],
            policy_draft: {
              label: storedLabel,
              note,
              approved_rails: rails,
              settlement_currency: storedCurrency,
            },
            digest: 'sha256:1a6756614a1f',
          } as any
          setStructures([mockStructure])
        } catch {
          setStructures([])
        }
      })
    return () => { cancelled = true }
  }, [agent?.agent_id])

  const latestStructure = useMemo(() => {
    for (let i = structures.length - 1; i >= 0; i--) {
      const s = structures[i]
      if (s.status === 'ATTACHED' || s.status === 'CONSUMED' || s.status === 'DRAFT_ATTACHED') return s
    }
    return structures[structures.length - 1] ?? null
  }, [structures])

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      if (search) {
        const q = search.toLowerCase()
        const haystack = [a.agent_id, a.purpose, a.owner_principal, a.model_version, agentRole(a)]
          .map(String)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (envFilter !== 'All' && String(a.environment ?? '').toUpperCase() !== envFilter.toUpperCase()) return false
      if (statusFilter !== 'All' && String(a.revocation_status ?? '').toUpperCase() !== statusFilter.toUpperCase()) return false
      if (roleFilter !== 'All' && agentRole(a) !== roleFilter) return false
      return true
    })
  }, [agents, search, envFilter, statusFilter, roleFilter])

  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)

  const activeCount = agents.filter((a) => String(a.revocation_status ?? '').toLowerCase() === 'active').length

  return (
    <div className="bg-[#F7F8FB] min-h-screen">
      {/* Header */}
      <ControlPlaneHeader
        title="Agent Registry"
        subtitle="Tenant-owned governed workloads with explicit identity, bounded capabilities, policy bindings and revocation controls."
        chips={
          <>
            <Badge color="blue">{agents.length} AGENTS</Badge>
            <Badge color="green">{activeCount} ACTIVE</Badge>
            <Badge color="purple">{agents.length} CAPABILITY PROFILES</Badge>
          </>
        }
      />

      {/* Search + Filters */}
      <div className="border-b border-[#D8DEE9] bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] text-[14px]">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agent ID, name, owner, purpose…"
              className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-[13px] text-[#0B1324] outline-none focus:border-[#2E5BFF]/50 focus:bg-white"
            />
          </div>
          <FilterSelect value={envFilter} onChange={setEnvFilter} label="Environment" options={['All', 'SANDBOX', 'DEMO', 'PRODUCTION']} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status" options={['All', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']} />
          <FilterSelect value={roleFilter} onChange={setRoleFilter} label="Role" options={['All', 'Financial Action Agent', 'Dispatch Coordination Agent', 'Lifecycle Observer Agent', 'Resolution Agent']} />
        </div>
      </div>

      {/* 35/65 Layout */}
      <div className="grid min-h-[calc(100vh-220px)] lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
        {/* Left: Agent List */}
        <div className="border-r border-[#D8DEE9] bg-white p-4 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              Registered agents ({filteredAgents.length})
            </p>
          </div>
          {filteredAgents.map((a) => {
            const isActive = a.agent_id === agent?.agent_id
            const role = agentRole(a)
            const status = String(a.revocation_status ?? 'active').toUpperCase()
            const env = String(a.environment ?? 'SANDBOX').toUpperCase()
            const policyNs = String(a.policy_namespace ?? '')
            return (
              <button
                key={String(a.agent_id)}
                type="button"
                onClick={() => { setSelectedAgentId(String(a.agent_id)); setActiveTab('overview') }}
                className={`w-full rounded-xl border p-3.5 text-left transition ${
                  isActive
                    ? 'border-[#0B1324] bg-[#F1F5F9] shadow-sm'
                    : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#0B1324]">
                      {String(a.purpose ?? '').split('—')[0].trim()}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#64748B]">{String(a.agent_id)}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase ${status === 'ACTIVE' ? 'text-[#138A63]' : 'text-[#C2413B]'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-[#138A63]' : 'bg-[#C2413B]'}`} />
                      {status}
                    </span>
                    <span className="text-[9px] font-medium text-[#94A3B8]">{env}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-[#64748B]">{role}</p>
                <p className="mt-0.5 text-[11px] text-[#94A3B8]">{agentShortPurpose(a)}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[#64748B]">
                  <span>Owner {String(a.owner_principal ?? '').split('_').slice(-1)[0]}</span>
                </div>
                {policyNs ? (
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Policy <span className="font-medium text-[#0B1324]">{policyNs}</span>
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <Badge color="green">IDENTITY ✓</Badge>
                  <Badge color="green">ATTESTATION ✓</Badge>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right: Selected Agent Detail */}
        <div className="overflow-y-auto p-6">
          {agent ? (
            <AgentDetail agent={agent} structure={latestStructure} actions={actions} activeTab={activeTab} setActiveTab={setActiveTab} href={href} />
          ) : (
            <div className="rounded-xl border border-dashed border-[#D8DEE9] bg-white px-4 py-16 text-center text-[13px] text-[#64748B]">
              Select an agent to inspect its capability profile, policy bindings and identity.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Filter dropdown ────────────────────────────────────────────────────── */

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-[12px] text-[#0B1324] outline-none focus:border-[#2E5BFF]/50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  )
}

/* ── Agent Detail (right panel) ─────────────────────────────────────────── */

function AgentDetail({
  agent,
  structure,
  actions,
  activeTab,
  setActiveTab,
  href,
}: {
  agent: Record<string, unknown>
  structure: AgentBoundStructure | null
  actions: ControlPlaneActionSummary[]
  activeTab: Tab
  setActiveTab: (t: Tab) => void
  href: (path: string) => string
}) {
  const role = agentRole(agent)
  const status = String(agent.revocation_status ?? 'active').toUpperCase()
  const env = String(agent.environment ?? 'SANDBOX').toUpperCase()
  const permittedActions = (agent.permitted_action_types ?? []) as string[]
  const permittedTools = (agent.permitted_tools ?? []) as string[]
  const permittedSources = (agent.permitted_sources ?? []) as string[]
  const allowedRails = (agent.allowed_rails ?? []) as string[]
  const jurisdictions = (agent.jurisdictions ?? []) as string[]
  const constraints = (agent.beneficiary_constraints ?? {}) as Record<string, unknown>
  const maxAmount = (agent.max_amount_per_action ?? null) as { amount_minor?: number; currency?: string } | null
  const dailyBudget = (agent.daily_budget ?? null) as { amount_minor?: number; currency?: string } | null

  const formatAmount = (amt: { amount_minor?: number; currency?: string } | null) => {
    if (!amt?.amount_minor) return '—'
    const rupees = amt.amount_minor / 100
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const isPrimary = String(agent.agent_id) === CROSS_BORDER_AGENT_ID

  return (
    <div className="space-y-4">
      {/* Agent Header */}
      <div className="rounded-xl border border-[#D8DEE9] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status === 'ACTIVE' ? 'bg-[#138A63]' : 'bg-[#C2413B]'}`} />
              <span className="text-[11px] font-semibold uppercase text-[#138A63]">{status}</span>
              <span className="text-[11px] font-medium text-[#94A3B8]">· {env}</span>
            </div>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-[#0B1324]">
              {String(agent.purpose ?? '').split('—')[0].trim()}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#64748B]">{role}</p>
            <p className="mt-1 font-mono text-[12px] text-[#64748B]">{String(agent.agent_id)}</p>
            <p className="mt-0.5 text-[13px] text-[#0B1324]">
              {String(agent.purpose ?? '').includes('—')
                ? String(agent.purpose ?? '').split('—')[1]?.trim()
                : agentShortPurpose(agent)}
            </p>
            <p className="mt-1 text-[12px] text-[#64748B]">
              Owner <span className="font-medium text-[#0B1324]">{String(agent.owner_principal)}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="inline-flex h-8 items-center rounded-md border border-[#E2E8F0] bg-white px-3 text-[11px] font-semibold text-[#64748B] hover:bg-[#F8FAFC]">
              Suspend
            </button>
            <button type="button" className="inline-flex h-8 items-center rounded-md border border-[#F8E8E7] bg-[#FDF2F2] px-3 text-[11px] font-semibold text-[#C2413B] hover:bg-[#F8E8E7]">
              Revoke
            </button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-0 overflow-x-auto rounded-xl border border-[#D8DEE9] bg-white px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold tracking-[0.04em] transition ${
              activeTab === tab.key
                ? 'border-b-2 border-[#0B1324] text-[#0B1324]'
                : 'text-[#94A3B8] hover:text-[#64748B]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab agent={agent} structure={structure} role={role} href={href} isPrimary={isPrimary} />
      )}
      {activeTab === 'capabilities' && (
        <CapabilitiesTab
          permittedActions={permittedActions}
          permittedTools={permittedTools}
          permittedSources={permittedSources}
          allowedRails={allowedRails}
          maxAmount={maxAmount}
          dailyBudget={dailyBudget}
          constraints={constraints}
          jurisdictions={jurisdictions}
          role={role}
        />
      )}
      {activeTab === 'policy' && <PolicyTab agent={agent} structure={structure} href={href} />}
      {activeTab === 'identity' && <IdentityTab agent={agent} />}
      {activeTab === 'mcp' && <McpTab agent={agent} />}
      {activeTab === 'history' && <HistoryTab actions={actions} agentId={String(agent.agent_id)} href={href} />}
    </div>
  )
}

/* ── Overview Tab ───────────────────────────────────────────────────────── */

function OverviewTab({
  agent,
  structure,
  role,
  href,
  isPrimary,
}: {
  agent: Record<string, unknown>
  structure: AgentBoundStructure | null
  role: AgentRole
  href: (path: string) => string
  isPrimary: boolean
}) {
  const maxAmount = agent.max_amount_per_action as { amount_minor?: number; currency?: string } | null
  const dailyBudget = agent.daily_budget as { amount_minor?: number; currency?: string } | null
  const constraints = (agent.beneficiary_constraints ?? {}) as Record<string, unknown>
  const jurisdictions = (agent.jurisdictions ?? []) as string[]
  const permittedActions = (agent.permitted_action_types ?? []) as string[]
  const permittedTools = (agent.permitted_tools ?? []) as string[]
  const permittedSources = (agent.permitted_sources ?? []) as string[]
  const allowedRails = (agent.allowed_rails ?? []) as string[]
  const policyNs = String(agent.policy_namespace ?? '')
  const approvalProfile = String(agent.approval_profile ?? '')

  const formatAmt = (amt: { amount_minor?: number; currency?: string } | null) => {
    if (!amt?.amount_minor) return '—'
    return `₹${(amt.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-4">
      {/* Agent Identity */}
      <SectionCard title="AGENT IDENTITY">
        <div className="divide-y divide-[#F1F5F9]">
          <Field label="Agent ID" value={<span className="font-mono">{String(agent.agent_id)}</span>} />
          <Field label="Tenant" value={<span className="font-mono">{String(agent.tenant_id ?? '—')}</span>} />
          <Field label="Owner Principal" value={String(agent.owner_principal ?? '—')} />
          <Field label="Agent Role" value={role} />
          <Field label="Purpose" value={String(agent.purpose ?? '—')} />
          <Field label="Environment" value={String(agent.environment ?? '—')} />
          <Field label="Model Provider" value={String(agent.model_provider ?? '—')} />
          <Field label="Model Version" value={String(agent.model_version ?? '—')} />
        </div>
      </SectionCard>

      {/* Bounded Capabilities */}
      <SectionCard title="BOUNDED CAPABILITIES" badge="What this agent is permitted to do">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Permitted Actions</p>
            <div className="mt-1.5"><ChipList items={permittedActions.map((a) => a.toLowerCase().replace(/_/g, ' '))} /></div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Permitted Tools</p>
            <div className="mt-1.5"><ChipList items={permittedTools.map((t) => t.replace(/_/g, ' '))} color="purple" /></div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Permitted Sources</p>
            <div className="mt-1.5"><ChipList items={permittedSources.map((s) => s.replace(/_/g, ' '))} color="green" /></div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Allowed Rails</p>
            <div className="mt-1.5"><ChipList items={allowedRails.length ? allowedRails : ['— attach Policy Studio draft to bind rails']} /></div>
          </div>
        </div>
        {role === 'Financial Action Agent' ? (
          <div className="mt-4 rounded-lg border border-[#F3E8FF] bg-[#FAFAFE] p-3">
            <p className="text-[11px] font-semibold text-[#6D4AFF]">PURPOSE</p>
            <p className="mt-0.5 text-[12px] text-[#0B1324]">Understand request → retrieve context → propose action</p>
            <p className="mt-2 text-[11px] font-semibold text-[#6D4AFF]">AUTHORITY</p>
            <p className="mt-0.5 text-[12px] font-semibold text-[#0B1324]">PROPOSE ONLY</p>
            <p className="mt-1 text-[12px] text-[#94A3B8]">✕ Cannot approve · ✕ Cannot dispatch</p>
          </div>
        ) : null}
      </SectionCard>

      {/* Financial Boundaries + Attached Policy side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="FINANCIAL BOUNDARIES">
          <div className="divide-y divide-[#F1F5F9]">
            <Field label="Maximum / Action" value={formatAmt(maxAmount)} />
            <Field label="Daily Budget" value={formatAmt(dailyBudget)} />
            <div className="py-1.5">
              <p className="text-[11px] font-semibold text-[#64748B]">Beneficiary Constraints</p>
              {Object.keys(constraints).length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(constraints).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1.5 text-[12px] text-[#0B1324]">
                      <span className="text-[#138A63]">✓</span>
                      {k.replace(/_/g, ' ')}{v === true ? '' : `: ${String(v)}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-[#94A3B8]">No constraints</p>
              )}
            </div>
            <div className="py-1.5">
              <p className="text-[11px] font-semibold text-[#64748B]">Jurisdictions</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {jurisdictions.map((j) => (
                  <span key={j} className="inline-flex items-center gap-1 rounded border border-[#E2E8F0] bg-white px-2 py-0.5 text-[11px] text-[#0B1324]">
                    <span className="text-[#138A63]">✓</span> {j}
                  </span>
                ))}
                {jurisdictions.length === 0 && <span className="text-[12px] text-[#94A3B8]">—</span>}
              </div>
            </div>
            <Field label="Settlement Currency" value={String((agent as Record<string, unknown>).settlement_currency ?? 'INR')} />
          </div>
        </SectionCard>

        <SectionCard title="ATTACHED POLICY" badge={structure ? 'PUBLISHED' : policyNs ? 'PUBLISHED' : 'NONE'}>
          {structure ? (
            <div className="divide-y divide-[#F1F5F9]">
              <Field label="Policy Label" value={structure.policy_label || structure.policy_draft?.label || policyNs || '—'} />
              <Field label="Policy Namespace" value={policyNs || '—'} />
              <Field label="Policy Hash" value={<span className="font-mono text-[11px]">{structure.digest ? `sha256:${String(structure.digest).slice(7, 19)}…` : '—'}</span>} />
              <Field label="Approved Rails" value={(structure.policy_draft?.approved_rails ?? structure.approved_rails ?? []).join(', ') || '—'} />
              <Field label="Settlement Currency" value={structure.settlement_currency || structure.policy_draft?.settlement_currency || '—'} />
              <Field label="Approval Profile" value={approvalProfile.replace(/_/g, ' ') || '—'} />
              <Field label="Affected Agent" value={String(agent.purpose ?? '').split('—')[0].trim()} />
              <Field label="Affected Actions" value={permittedActions.map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', ') || '—'} />
              <Field label="Structure Status" value={<Badge color={structure.status === 'ATTACHED' ? 'green' : structure.status === 'CONSUMED' ? 'blue' : 'purple'}>{structure.status}</Badge>} />
            {(structure.business_note || structure.policy_draft?.note) ? (
              <div className="py-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">User Instruction</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#0B1324]">{structure.business_note || structure.policy_draft?.note}</p>
              </div>
            ) : null}
            </div>
          ) : policyNs ? (
            <div className="divide-y divide-[#F1F5F9]">
              <Field label="Policy Namespace" value={policyNs} />
              <Field label="Approval Profile" value={approvalProfile.replace(/_/g, ' ')} />
              <Field label="Affected Agent" value={String(agent.purpose ?? '').split('—')[0].trim()} />
              <Field label="Affected Actions" value={permittedActions.map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', ') || '—'} />
            </div>
          ) : (
            <p className="text-[12px] text-[#94A3B8]">No policy attached. Create one in Policy Studio.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={href('/controls/policies?create=1')}
              className="inline-flex h-8 items-center rounded-md bg-[#0B1324] px-3 text-[11px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Create policy
            </Link>
            <Link
              href={href('/controls/policies')}
              className="inline-flex h-8 items-center rounded-md border border-[#D8DEE9] px-3 text-[11px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
            >
              Open Policy Studio
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Policy Rules */}
      {(policyNs || (structure?.control_labels?.length ?? 0) > 0) ? (
        <SectionCard title="POLICY RULES" badge={`${(structure?.control_labels ?? []).length || 4} CONTROLS`}>
          <div className="space-y-2">
            {(structure?.control_labels ?? []).length > 0
              ? (structure?.control_labels ?? []).map((label, i) => (
                  <div key={`ctrl-${i}`} className="flex items-start justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0B1324]">R-{String(i + 1).padStart(3, '0')} <span className="text-[#64748B] font-normal">CONTROL</span></p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{label}</p>
                    </div>
                    <Badge color="green">ENFORCED</Badge>
                  </div>
                ))
              : [
                  { id: 'R-001', kind: 'SOURCE', desc: 'Accept only from approved file source' },
                  { id: 'R-002', kind: 'SETTLEMENT', desc: 'Settlement currency must be INR' },
                  { id: 'R-003', kind: 'RAILS', desc: allowedRails.join(' · ') || 'NEFT · RTGS · IMPS' },
                  { id: 'R-004', kind: 'APPROVAL', desc: 'Second approval above ₹50,000' },
                ].map((rule) => (
                  <div key={rule.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0B1324]">{rule.id} <span className="text-[#64748B] font-normal">{rule.kind}</span></p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{rule.desc}</p>
                    </div>
                    <Badge color="green">ENFORCED</Badge>
                  </div>
                ))
            }
          </div>
        </SectionCard>
      ) : null}

      {/* Control / Regulatory Bindings */}
      <SectionCard title="CONTROL & REGULATORY BINDINGS">
        <div className="divide-y divide-[#F1F5F9]">
          <Field label="Scope" value="Domestic supplier payouts" />
          <Field label="Jurisdiction" value={jurisdictions.join(', ') || '—'} />
          <div className="py-1.5">
            <p className="text-[11px] font-semibold text-[#64748B]">Attached Controls</p>
            <ul className="mt-1 space-y-0.5">
              {(structure?.control_labels ?? ['Approved beneficiary control', 'Rail restriction', 'Approval threshold', 'Source restriction']).map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-[12px] text-[#0B1324]">
                  <span className="text-[#138A63]">✓</span> {c}
                </li>
              ))}
            </ul>
          </div>
          <Field label="Control Set Version" value={policyNs ? 'v14' : '—'} />
        </div>
      </SectionCard>

      {/* Workload Identity & Attestation */}
      <SectionCard title="WORKLOAD IDENTITY & ATTESTATION" badge="✓ VERIFIED">
        <div className="divide-y divide-[#F1F5F9]">
          <Field label="Key Thumbprint" value={<span className="font-mono">{String(agent.key_thumbprint ?? '—')}</span>} mono />
          <Field label="Identity Status" value={<Badge color="green">✓ VERIFIED</Badge>} />
          <Field label="Attestation Status" value={<Badge color="green">✓ VERIFIED</Badge>} />
          <Field label="Issued At" value={String(agent.issued_at ?? '—')} />
          <Field label="Last Attestation" value={String((agent as Record<string, unknown>).last_attestation ?? agent.issued_at ?? '—')} />
          <Field label="Expires At" value={String(agent.expires_at ?? '—')} />
          <Field label="Revocation" value={<span className="font-semibold text-[#138A63]">{String(agent.revocation_status ?? 'ACTIVE').toUpperCase()}</span>} />
          <Field label="Signature" value="ES256" />
        </div>
      </SectionCard>

      {/* Authority Model */}
      <SectionCard title="AUTHORITY MODEL">
        <div className="flex flex-col items-center gap-1 py-2">
          {['Enterprise', 'Delegating Principal', 'Agent / Workload Identity', 'Action Proposal', 'Policy Decision', 'Required Approvals', 'PAC'].map((step, i) => (
            <div key={step} className="flex flex-col items-center">
              <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[12px] font-medium text-[#0B1324]">
                {step}
              </span>
              {i < 6 && <span className="text-[#CBD5E1] text-[14px]">↓</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] font-semibold text-[#6D4AFF]">
          Agent capability ≠ transaction authorization
        </p>
        <div className="mt-3 flex justify-center">
          <Link
            href={href(`/actions/${CROSS_BORDER_TRACE_ID}/authority`)}
            className="inline-flex h-8 items-center rounded-md border border-[#D8DEE9] px-3 text-[11px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
          >
            Open Authority Graph
          </Link>
        </div>
      </SectionCard>

      {/* MCP / A2A */}
      <McpTab agent={agent} />

      {/* Signed JSON */}
      <SectionCard title="AGENT CAPABILITY PROFILE" badge="SIGNED ✓">
        <ProtocolJsonPanel object={agent} title={`v${(agent as Record<string, unknown>).profile_version ?? '1'} · ${String(agent.key_thumbprint ?? '').slice(0, 12)}…`} />
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyChip label="Agent" value={String(agent.agent_id ?? '')} wide />
          <CopyChip label="Key" value={String(agent.key_thumbprint ?? '')} wide />
        </div>
      </SectionCard>
    </div>
  )
}

/* ── Capabilities Tab ───────────────────────────────────────────────────── */

function CapabilitiesTab({
  permittedActions,
  permittedTools,
  permittedSources,
  allowedRails,
  maxAmount,
  dailyBudget,
  constraints,
  jurisdictions,
  role,
}: {
  permittedActions: string[]
  permittedTools: string[]
  permittedSources: string[]
  allowedRails: string[]
  maxAmount: { amount_minor?: number; currency?: string } | null
  dailyBudget: { amount_minor?: number; currency?: string } | null
  constraints: Record<string, unknown>
  jurisdictions: string[]
  role: AgentRole
}) {
  const fmt = (amt: { amount_minor?: number; currency?: string } | null) => {
    if (!amt?.amount_minor) return '—'
    return `₹${(amt.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-4">
      <SectionCard title="PERMITTED ACTIONS">
        <ChipList items={permittedActions.map((a) => a.toLowerCase().replace(/_/g, ' '))} />
      </SectionCard>
      <SectionCard title="PERMITTED TOOLS">
        <ChipList items={permittedTools.map((t) => t.replace(/_/g, ' '))} color="purple" />
      </SectionCard>
      <SectionCard title="PERMITTED SOURCES">
        <ChipList items={permittedSources.map((s) => s.replace(/_/g, ' '))} color="green" />
      </SectionCard>
      <SectionCard title="ALLOWED RAILS">
        <ChipList items={allowedRails.length ? allowedRails : ['—']} />
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="FINANCIAL BOUNDARIES">
          <div className="divide-y divide-[#F1F5F9]">
            <Field label="Maximum / Action" value={fmt(maxAmount)} />
            <Field label="Daily Budget" value={fmt(dailyBudget)} />
            <div className="py-1.5">
              <p className="text-[11px] font-semibold text-[#64748B]">Beneficiary Constraints</p>
              {Object.keys(constraints).length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(constraints).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1.5 text-[12px] text-[#0B1324]">
                      <span className="text-[#138A63]">✓</span> {k.replace(/_/g, ' ')}{v === true ? '' : `: ${String(v)}`}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[12px] text-[#94A3B8]">No constraints</p>}
            </div>
          </div>
        </SectionCard>
        <SectionCard title="JURISDICTIONS">
          <div className="flex flex-wrap gap-1.5">
            {jurisdictions.map((j) => (
              <span key={j} className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[12px] text-[#0B1324]">
                <span className="text-[#138A63]">✓</span> {j}
              </span>
            ))}
            {jurisdictions.length === 0 && <span className="text-[12px] text-[#94A3B8]">—</span>}
          </div>
        </SectionCard>
      </div>
      {role === 'Financial Action Agent' ? (
        <SectionCard title="APPROVAL PROFILE">
          <div className="divide-y divide-[#F1F5F9]">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[12px] font-medium text-[#0B1324]">≤ ₹50,000</p>
                <p className="text-[11px] text-[#64748B]">Standard approval</p>
              </div>
              <Badge color="green">AUTO</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[12px] font-medium text-[#0B1324]">&gt; ₹50,000</p>
                <p className="text-[11px] text-[#64748B]">2 approvals required</p>
              </div>
              <Badge color="blue">DUAL</Badge>
            </div>
            <Field label="Separation of Duties" value={<Badge color="green">✓ Required</Badge>} />
            <Field label="Authentication" value="Step-up / passkey" />
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

/* ── Policy Tab ─────────────────────────────────────────────────────────── */

function PolicyTab({ agent, structure, href }: { agent: Record<string, unknown>; structure: AgentBoundStructure | null; href: (path: string) => string }) {
  const policyNs = String(agent.policy_namespace ?? '')
  const approvalProfile = String(agent.approval_profile ?? '')
  const allowedRails = (agent.allowed_rails ?? []) as string[]
  const structureRails = (structure?.policy_draft?.approved_rails ?? structure?.approved_rails ?? []) as string[]
  const displayRails = structureRails.length ? structureRails : allowedRails

  return (
    <div className="space-y-4">
      <SectionCard title="ATTACHED POLICY" badge={structure ? 'PUBLISHED' : policyNs ? 'PUBLISHED' : 'NONE'}>
        {structure ? (
          <div className="divide-y divide-[#F1F5F9]">
            <Field label="Policy Label" value={structure.policy_label || structure.policy_draft?.label || policyNs || '—'} />
            <Field label="Policy Namespace" value={policyNs || '—'} />
            <Field label="Policy Hash" value={<span className="font-mono text-[11px]">{structure.digest ? `sha256:${String(structure.digest).slice(7, 19)}…` : '—'}</span>} />
            <Field label="Approved Rails" value={displayRails.join(', ') || '—'} />
            <Field label="Settlement Currency" value={structure.settlement_currency || structure.policy_draft?.settlement_currency || '—'} />
            <Field label="Approval Profile" value={approvalProfile.replace(/_/g, ' ') || '—'} />
            <Field label="Affected Agent" value={String(agent.purpose ?? '').split('—')[0].trim()} />
            <Field label="Affected Actions" value={((agent.permitted_action_types ?? []) as string[]).map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', ')} />
            <Field label="Structure Status" value={<Badge color={structure.status === 'ATTACHED' ? 'green' : structure.status === 'CONSUMED' ? 'blue' : 'purple'}>{structure.status}</Badge>} />
          </div>
        ) : policyNs ? (
          <div className="divide-y divide-[#F1F5F9]">
            <Field label="Policy Namespace" value={policyNs} />
            <Field label="Approval Profile" value={approvalProfile.replace(/_/g, ' ')} />
            <Field label="Affected Agent" value={String(agent.purpose ?? '').split('—')[0].trim()} />
            <Field label="Affected Actions" value={((agent.permitted_action_types ?? []) as string[]).map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', ')} />
          </div>
        ) : (
          <p className="text-[12px] text-[#94A3B8]">No policy attached.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={href('/controls/policies?create=1')} className="inline-flex h-8 items-center rounded-md bg-[#0B1324] px-3 text-[11px] font-semibold text-white">Create policy</Link>
          <Link href={href('/controls/policies')} className="inline-flex h-8 items-center rounded-md border border-[#D8DEE9] px-3 text-[11px] font-semibold text-[#0B1324]">Open Policy Studio</Link>
        </div>
      </SectionCard>

      {(policyNs || (structure?.control_labels?.length ?? 0) > 0) ? (
        <SectionCard title="POLICY RULES" badge={`${(structure?.control_labels ?? []).length || 4} CONTROLS`}>
          <div className="space-y-2">
            {(structure?.control_labels ?? []).length > 0
              ? (structure?.control_labels ?? []).map((label, i) => (
                  <div key={`ctrl-${i}`} className="flex items-start justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0B1324]">R-{String(i + 1).padStart(3, '0')} <span className="text-[#64748B] font-normal">CONTROL</span></p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{label}</p>
                    </div>
                    <Badge color="green">ENFORCED</Badge>
                  </div>
                ))
              : [
                  { id: 'R-001', kind: 'SOURCE', desc: 'Accept only from approved file source' },
                  { id: 'R-002', kind: 'SETTLEMENT', desc: 'Settlement currency must be INR' },
                  { id: 'R-003', kind: 'RAILS', desc: displayRails.join(' · ') || 'NEFT · RTGS · IMPS' },
                  { id: 'R-004', kind: 'APPROVAL', desc: 'Second approval above ₹50,000' },
                ].map((rule) => (
                  <div key={rule.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#0B1324]">{rule.id} <span className="text-[#64748B] font-normal">{rule.kind}</span></p>
                      <p className="mt-0.5 text-[12px] text-[#64748B]">{rule.desc}</p>
                    </div>
                    <Badge color="green">ENFORCED</Badge>
                  </div>
                ))
            }
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="CONTROL & REGULATORY BINDINGS">
        <div className="divide-y divide-[#F1F5F9]">
          <Field label="Scope" value="Domestic supplier payouts" />
          <div className="py-1.5">
            <p className="text-[11px] font-semibold text-[#64748B]">Attached Controls</p>
            <ul className="mt-1 space-y-0.5">
              {['Approved beneficiary control', 'Rail restriction', 'Approval threshold', 'Source restriction'].map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-[12px] text-[#0B1324]">
                  <span className="text-[#138A63]">✓</span> {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

/* ── Identity Tab ───────────────────────────────────────────────────────── */

function IdentityTab({ agent }: { agent: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <SectionCard title="WORKLOAD IDENTITY & ATTESTATION" badge="✓ VERIFIED">
        <div className="divide-y divide-[#F1F5F9]">
          <Field label="Key Thumbprint" value={<span className="font-mono">{String(agent.key_thumbprint ?? '—')}</span>} mono />
          <Field label="Identity Status" value={<Badge color="green">✓ VERIFIED</Badge>} />
          <Field label="Attestation Status" value={<Badge color="green">✓ VERIFIED</Badge>} />
          <Field label="Issued At" value={String(agent.issued_at ?? '—')} />
          <Field label="Last Attestation" value={String((agent as Record<string, unknown>).last_attestation ?? agent.issued_at ?? '—')} />
          <Field label="Expires At" value={String(agent.expires_at ?? '—')} />
          <Field label="Revocation" value={<span className="font-semibold text-[#138A63]">{String(agent.revocation_status ?? 'ACTIVE').toUpperCase()}</span>} />
          <Field label="Signature" value="ES256" />
          <Field label="Profile Version" value={String((agent as Record<string, unknown>).profile_version ?? '—')} />
        </div>
        <div className="mt-3">
          <button type="button" className="inline-flex h-8 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[11px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]">
            Verify Identity
          </button>
        </div>
      </SectionCard>

      <SectionCard title="AGENT CAPABILITY PROFILE" badge="SIGNED ✓">
        <ProtocolJsonPanel object={agent} title={`v${(agent as Record<string, unknown>).profile_version ?? '1'} · ${String(agent.key_thumbprint ?? '').slice(0, 12)}…`} />
      </SectionCard>
    </div>
  )
}

/* ── MCP / A2A Tab ──────────────────────────────────────────────────────── */

function McpTab({ agent }: { agent: Record<string, unknown> }) {
  const tools = (agent.permitted_tools ?? []) as string[]

  return (
    <SectionCard title="INTEROPERABILITY">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">MCP</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[#138A63] text-[12px]">●</span>
            <span className="text-[12px] font-medium text-[#0B1324]">CONFIGURED</span>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-[#64748B]">Permitted skills</p>
          <ul className="mt-1 space-y-0.5">
            {tools.map((t) => (
              <li key={t} className="text-[12px] text-[#0B1324]">• {t.replace(/_/g, ' ')}</li>
            ))}
            {tools.length === 0 && <li className="text-[12px] text-[#94A3B8]">None configured</li>}
          </ul>
        </div>
        <div className="rounded-lg border border-[#F1F5F9] bg-[#FAFAFE] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">A2A</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[#B7791F] text-[12px]">●</span>
            <span className="text-[12px] font-medium text-[#B7791F]">PLANNED</span>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-[#64748B]">Agent Card</p>
          <ul className="mt-1 space-y-0.5">
            {['identity', 'skills', 'capabilities', 'artifacts'].map((f) => (
              <li key={f} className="text-[12px] text-[#64748B]">• {f}</li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  )
}

/* ── History Tab ────────────────────────────────────────────────────────── */

function HistoryTab({
  actions,
  agentId,
  href,
}: {
  actions: ControlPlaneActionSummary[]
  agentId: string
  href: (path: string) => string
}) {
  const agentActions = actions.filter((a) => a.agent_id === agentId || !agentId)

  return (
    <SectionCard title="HISTORICAL ACTIONS" badge={`${agentActions.length} ACTIONS`}>
      {agentActions.length === 0 ? (
        <p className="text-[12px] text-[#94A3B8]">No actions recorded for this agent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#F1F5F9]">
                <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Trace ID</th>
                <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Action</th>
                <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Policy</th>
                <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Result</th>
                <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {agentActions.map((a) => (
                <tr key={a.trace_id} className="border-b border-[#F8FAFC]">
                  <td className="py-2">
                    <Link href={href(`/actions/${a.trace_id}/dispatch`)} className="font-mono text-[11px] text-[#2E5BFF] hover:underline">
                      {a.trace_id.length > 16 ? `${a.trace_id.slice(0, 16)}…` : a.trace_id}
                    </Link>
                  </td>
                  <td className="py-2 text-[12px] text-[#0B1324]">{a.rail || 'supplier payout'}</td>
                  <td className="py-2 text-[12px] text-[#64748B]">v14</td>
                  <td className="py-2">
                    <Badge color={a.current_state === 'SETTLED_CONFIRMED' ? 'green' : a.current_state.includes('REVIEW') ? 'amber' : 'blue'}>
                      {a.current_state?.replace(/_/g, ' ') ?? '—'}
                    </Badge>
                  </td>
                  <td className="py-2 text-[12px] text-[#0B1324]">{a.amount_display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
