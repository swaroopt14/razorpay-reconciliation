'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CONNECTION_KIND_META,
  CONNECTIONS_HEADER,
  DEMO_CONNECTIONS,
  TRANSPORT_OPTIONS,
  connectionSummary,
  connectionsByKind,
  type ConnectionKind,
  type ConnectionRecord,
  type ConnectionStatus,
  type Transport,
} from '@/services/payout-command/demo/connectionsDemo'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'

type MainTab = 'overview' | 'security' | 'logs'

type WizardState = {
  open: boolean
  kind: ConnectionKind
  transport: Transport
  name: string
  submitted: boolean
}

type ToastState = { tone: 'ok' | 'warn' | 'info'; message: string } | null

const STATUS_STYLE: Record<ConnectionStatus, string> = {
  Live: 'border-[#0B1324] bg-[#0B1324] text-white',
  Sandbox: 'border-[#0B1324] bg-[#0B1324] text-white',
  'File-based': 'border-[#0B1324] bg-[#0B1324] text-white',
  Degraded: 'border-[#0B1324] bg-[#0B1324] text-white',
  Planned: 'border-[#0B1324] bg-[#0B1324] text-white',
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-medium text-[#0B1324]">{value}</p>
    </div>
  )
}

function ConnectionRow({
  conn,
  onTest,
  onRetry,
}: {
  conn: ConnectionRecord
  onTest: (c: ConnectionRecord) => void
  onRetry: (c: ConnectionRecord) => void
}) {
  const planned = conn.mode === 'Planned' || conn.disabled
  const degraded = conn.mode === 'Degraded'
  const fileBased = conn.mode === 'File-based'

  return (
    <article
      className={`border border-[#E2E8F0] bg-white transition ${
        planned ? 'opacity-70' : 'hover:border-[#0B1324]/25'
      } ${degraded ? 'border-l-2 border-l-[#D97706]' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[#0B1324]">{conn.name}</h3>
            <StatusBadge status={conn.mode} />
            <span className="text-[11px] font-medium text-[#64748B]">{conn.subtype}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">
            Transport · {conn.transport}
            {conn.notes ? <span className="text-[#94A3B8]"> · {conn.notes}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={planned}
            onClick={() => onTest(conn)}
            className="h-8 border border-[#0B1324] bg-[#0B1324] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:border-[#CBD5E1] disabled:bg-[#E2E8F0] disabled:text-[#94A3B8]"
          >
            Test connection
          </button>
          {degraded ? (
            <button
              type="button"
              onClick={() => onRetry(conn)}
              className="h-8 border border-[#2E5BFF] bg-[#2E5BFF] px-3 text-[12px] font-semibold text-white hover:bg-[#2448D4]"
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            disabled={planned || conn.mappingStatus === 'N/A'}
            className="h-8 border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
          >
            View mapping
          </button>
          <button
            type="button"
            disabled={planned}
            className="h-8 border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
          >
            View signal log
          </button>
          <button
            type="button"
            disabled={planned || fileBased}
            title={fileBased ? 'File-based path has no rotatable API secret' : 'Rotate credential'}
            className="h-8 border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
          >
            Rotate credential
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
        <MetaCell label="Authentication" value={conn.authScope} />
        <MetaCell label="Last signal" value={conn.lastSignal} />
        <MetaCell label="Data freshness" value={conn.freshness} />
        <MetaCell
          label="Mapping health"
          value={
            conn.mappingProfile
              ? `${conn.mappingStatus} · ${conn.mappingProfile}`
              : `${conn.mappingStatus} · schema ${conn.schemaVersion}`
          }
        />
      </div>

      {fileBased ? (
        <div className="grid gap-3 border-t border-[#E2E8F0] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
          <MetaCell label="Accepted formats" value={conn.acceptedFormats ?? '-'} />
          <MetaCell label="File hash" value={conn.fileHash ?? '-'} />
          <MetaCell label="Mapping profile" value={conn.mappingProfile ?? '-'} />
          <MetaCell label="Validation result" value={conn.validationResult ?? '-'} />
        </div>
      ) : null}

      {degraded ? (
        <div className="border-t border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-2.5 text-[12px] text-[#0B1324] sm:px-5">
          Last successful signal · {conn.lastSuccessSignal ?? '-'}
          {conn.retryHint ? <span className="text-[#0B1324]"> · {conn.retryHint}</span> : null}
        </div>
      ) : null}

      {planned ? (
        <div className="border-t border-[#E2E8F0] px-4 py-2.5 text-[12px] text-[#94A3B8] sm:px-5">
          Planned - disabled until provisioned. Not available in this demo workspace.
        </div>
      ) : null}
    </article>
  )
}

function KindSection({
  kind,
  onAdd,
  onTest,
  onRetry,
}: {
  kind: ConnectionKind
  onAdd: (kind: ConnectionKind) => void
  onTest: (c: ConnectionRecord) => void
  onRetry: (c: ConnectionRecord) => void
}) {
  const meta = CONNECTION_KIND_META[kind]
  const rows = connectionsByKind(kind)

  return (
    <section aria-labelledby={`conn-${kind}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 bg-[#2563EB]" aria-hidden />
            <h2 id={`conn-${kind}`} className="text-[16px] font-semibold text-[#0B1324]">
              {meta.title}
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-[#475569]">{meta.blurb}</p>
          <p className="mt-0.5 text-[11px] text-[#94A3B8]">{meta.examples}</p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(kind)}
          className="inline-flex h-9 items-center border border-[#0B1324] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
        >
          {meta.addLabel}
        </button>
      </div>
      <div className="space-y-2.5">
        {rows.map((conn) => (
          <ConnectionRow key={conn.id} conn={conn} onTest={onTest} onRetry={onRetry} />
        ))}
      </div>
    </section>
  )
}

function AddConnectionWizard({
  state,
  onClose,
  onChange,
  onSubmit,
}: {
  state: WizardState
  onClose: () => void
  onChange: (patch: Partial<WizardState>) => void
  onSubmit: () => void
}) {
  if (!state.open) return null
  const meta = CONNECTION_KIND_META[state.kind]

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B1324]/40 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close wizard" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-connection-title"
        className="relative z-[1] w-full max-w-lg border border-[#E2E8F0] bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-[#E2E8F0] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Add connection</p>
            <h2 id="add-connection-title" className="mt-0.5 text-[17px] font-semibold text-[#0B1324]">
              {meta.addLabel}
            </h2>
            <p className="mt-1 text-[12px] text-[#64748B]">Branches by type and transport. Credentials are never shown after save.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {state.submitted ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[15px] font-semibold text-[#0B1324]">Connection draft recorded</p>
            <p className="mt-2 text-[13px] text-[#64748B]">
              {state.name || 'Untitled'} · {state.transport}. Secrets are stored scoped and never re-displayed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">Type</span>
              <select
                value={state.kind}
                onChange={(e) => onChange({ kind: e.target.value as ConnectionKind })}
                className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0B1324]"
              >
                {(Object.keys(CONNECTION_KIND_META) as ConnectionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {CONNECTION_KIND_META[k].title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Transport
              </span>
              <select
                value={state.transport}
                onChange={(e) => onChange({ transport: e.target.value as Transport })}
                className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0B1324]"
              >
                {TRANSPORT_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Display name
              </span>
              <input
                value={state.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="e.g. Treasury SFTP drop"
                className="mt-1 h-10 w-full border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0B1324] outline-none focus:border-[#2563EB]"
              />
            </label>
            {(state.transport === 'API' ||
              state.transport === 'Webhook' ||
              state.transport === 'Kafka/event stream') && (
              <div className="border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-[12px] text-[#475569]">
                Paste a credential once to create the connection. After save it will appear only as a scoped
                label - never as a raw secret.
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Credential (write-only)"
                  className="mt-2 h-9 w-full border border-[#CBD5E1] bg-white px-3 text-[13px]"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-10 border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                className="h-10 bg-[#0B1324] px-4 text-[13px] font-semibold text-white"
              >
                Save connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
  * Spec 7.3 - Connections surface.
  * Lifecycle grouping: Source systems · Execution rails · Outcome sources.
  */
export function ConnectionsSurface() {
  const summary = useMemo(() => connectionSummary(), [])
  const [tab, setTab] = useState<MainTab>('overview')
  const [toast, setToast] = useState<ToastState>(null)
  const [wizard, setWizard] = useState<WizardState>({
    open: false,
    kind: 'source',
    transport: 'File upload',
    name: '',
    submitted: false,
  })

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const openWizard = (kind: ConnectionKind) => {
    setWizard({ open: true, kind, transport: 'File upload', name: '', submitted: false })
  }

  const testConnection = (c: ConnectionRecord) => {
    if (c.mode === 'Degraded') {
      setToast({
        tone: 'warn',
        message: `${c.name}: probe failed - last success ${c.lastSuccessSignal ?? 'unknown'}. Retry available.`,
      })
      return
    }
    if (c.mode === 'File-based') {
      setToast({
        tone: 'ok',
        message: `${c.name}: file path healthy · ${c.validationResult ?? 'mapping OK'} · hash ${c.fileHash ?? 'n/a'}`,
      })
      return
    }
    setToast({
      tone: 'ok',
      message: `${c.name}: sandbox probe succeeded · freshness ${c.freshness}`,
    })
  }

  const retryConnection = (c: ConnectionRecord) => {
    setToast({
      tone: 'info',
      message: `${c.name}: retry queued (${c.retryHint ?? 'sandbox probe'}).`,
    })
  }

  const tabs: { id: MainTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'security', label: 'Security' },
    { id: 'logs', label: 'Signal log' },
  ]

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <PageExplainerBanner page="connections" />
      <header className="border border-[#E2E8F0] bg-white px-5 py-5">
        <h1 className="max-w-3xl text-[1.45rem] font-semibold tracking-[-0.02em] text-[#0B1324] sm:text-[1.6rem]">
          {CONNECTIONS_HEADER.title}
        </h1>
        <p className="mt-3 text-[14px] font-medium text-[#0B1324]">{CONNECTIONS_HEADER.coreQuestion}</p>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#64748B]">
          Razorpay Test Mode API plus HMAC webhooks are the live ingest path for this demo. Bank statements
          and payroll files remain available as fallbacks. Planned rows are labelled — not a fake marketplace.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openWizard('source')}
            className="inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Add connection
          </button>
          <button
            type="button"
            onClick={() => openWizard('source')}
            className="inline-flex h-10 items-center border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Add source
          </button>
          <button
            type="button"
            onClick={() => openWizard('execution')}
            className="inline-flex h-10 items-center border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Add execution rail
          </button>
          <button
            type="button"
            onClick={() => openWizard('outcome')}
            className="inline-flex h-10 items-center border border-[#CBD5E1] bg-white px-4 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Add outcome source
          </button>
        </div>
      </header>

      {/* Lifecycle pulse strip */}
      <div className="grid grid-cols-3 border border-[#E2E8F0] bg-white divide-x divide-[#E2E8F0]">
        {(
          [
            ['Source systems', summary.sources],
            ['Execution rails', summary.rails],
            ['Outcome sources', summary.outcomes],
          ] as const
        ).map(([label, count]) => (
          <div key={label} className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0B1324]">{count}</p>
            <p className="text-[11px] text-[#94A3B8]">active in this workspace</p>
          </div>
        ))}
      </div>

      <div className="flex gap-0 border border-[#E2E8F0] bg-white">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-11 flex-1 px-3 text-[13px] font-semibold transition sm:flex-none sm:px-5 ${
              tab === t.id
                ? 'border-b-2 border-[#2563EB] text-[#0B1324]'
                : 'border-b-2 border-transparent text-[#64748B] hover:text-[#0B1324]'
            }`}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast ? (
        <div
          role="status"
          className="border border-[#0B1324] bg-[#0B1324] px-4 py-3 text-[13px] text-white"
        >
          {toast.message}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-8">
          <KindSection kind="source" onAdd={openWizard} onTest={testConnection} onRetry={retryConnection} />
          <KindSection kind="execution" onAdd={openWizard} onTest={testConnection} onRetry={retryConnection} />
          <KindSection kind="outcome" onAdd={openWizard} onTest={testConnection} onRetry={retryConnection} />
        </div>
      ) : null}

      {tab === 'security' ? (
        <section className="border border-[#E2E8F0] bg-white px-5 py-5">
          <h2 className="text-[15px] font-semibold text-[#0B1324]">Security</h2>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Credential scopes only - raw secrets never appear after creation. Rotate and audit live under
            Developer &amp; Integrations.
          </p>
          <ul className="mt-4 divide-y divide-[#E2E8F0] border border-[#E2E8F0]">
            {DEMO_CONNECTIONS.filter((c) => !c.disabled).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#0B1324]">{c.name}</p>
                  <p className="text-[12px] text-[#64748B]">{c.authScope}</p>
                </div>
                <StatusBadge status={c.mode} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-[#94A3B8]">
            API keys and partner tokens are managed in Developer - not Support / My Account.
          </p>
        </section>
      ) : null}

      {tab === 'logs' ? (
        <section className="border border-[#E2E8F0] bg-white px-5 py-5">
          <h2 className="text-[15px] font-semibold text-[#0B1324]">Signal log</h2>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Recent transport health for connections that have produced signals.
          </p>
          <ul className="mt-4 divide-y divide-[#E2E8F0] border border-[#E2E8F0]">
            {DEMO_CONNECTIONS.filter((c) => c.lastSignal !== '-')
              .slice()
              .sort((a, b) => b.lastSignal.localeCompare(a.lastSignal))
              .map((c) => (
                <li key={c.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[#0B1324]">{c.name}</p>
                    <p className="text-[12px] text-[#64748B]">{c.transport}</p>
                  </div>
                  <p className="font-mono text-[11px] text-[#475569]">{c.lastSignal}</p>
                  <StatusBadge status={c.mode} />
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <AddConnectionWizard
        state={wizard}
        onClose={() => setWizard((w) => ({ ...w, open: false }))}
        onChange={(patch) => setWizard((w) => ({ ...w, ...patch }))}
        onSubmit={() => setWizard((w) => ({ ...w, submitted: true }))}
      />
    </div>
  )
}
