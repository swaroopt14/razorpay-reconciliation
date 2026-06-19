'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { EnvironmentProvider, useEnvironment } from '@/services/auth/EnvironmentProvider'
import { SANDBOX_DOCS_LINKS } from '@/services/payout-command/sandbox-data'
import { ActivateLiveWizard } from '@/features/payout-command/sandbox/ActivateLiveWizard'
import { Glyph } from '@/features/payout-command/shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'

type WorkspaceKeysPayload = {
  tenant_id: string
  tenant_name: string | null
  workspace_code: string | null
  publishable_key: string | null
  secret_key_prefix: string | null
}

type DisplayApiKey = {
  type: 'publishable' | 'secret'
  mode: 'sandbox'
  value: string
  lastUsedAt: string | null
}

/**
 * ApiKeysClient — Stripe-style API keys page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┬─────────────────┐
 *   │ Page header                              │                 │
 *   │ Publishable keys card                    │ Recommendations │
 *   │ Secret keys card                         │ (sidebar)       │
 *   │ Recent API requests table                │                 │
 *   └──────────────────────────────────────────┴─────────────────┘
 *
 * Wraps in its own EnvironmentProvider so it works as a standalone route too.
 */
export function ApiKeysClient() {
  return (
    <EnvironmentProvider>
      <ApiKeysClientInner />
    </EnvironmentProvider>
  )
}

function ApiKeysClientInner() {
  const { canSwitchToLive, liveActivationStatus } = useEnvironment()
  const [activateOpen, setActivateOpen] = useState(false)
  const tenantId = useSessionTenantId()
  const [keys, setKeys] = useState<WorkspaceKeysPayload | null>(null)
  const [keysLoading, setKeysLoading] = useState(true)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    setKeysLoading(true)
    setKeysError(null)
    try {
      const res = await fetch('/api/sandbox/workspace-api-keys', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null
        setKeysError(j?.message || `Could not load keys (${res.status})`)
        setKeys(null)
        return
      }
      const body = (await res.json()) as WorkspaceKeysPayload
      setKeys(body)
      try {
        const stored = window.localStorage.getItem(`zord_tenant_api_key:${body.tenant_id}`)
        if (stored?.trim()) setTenantApiKey(stored.trim())
        else setTenantApiKey(null)
      } catch {
        setTenantApiKey(null)
      }
    } catch {
      setKeysError('Network error loading keys.')
      setKeys(null)
    } finally {
      setKeysLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys, tenantId])

  const publishableValue = keys?.publishable_key ?? keys?.workspace_code ?? ''
  const secretValue =
    tenantApiKey ??
    (keys?.secret_key_prefix ? `${keys.secret_key_prefix.slice(0, 16)}…` : '')

  const sandboxPublishable: DisplayApiKey = {
    type: 'publishable',
    mode: 'sandbox',
    value: publishableValue || '—',
    lastUsedAt: null,
  }
  const sandboxSecret: DisplayApiKey = {
    type: 'secret',
    mode: 'sandbox',
    value: secretValue || '—',
    lastUsedAt: null,
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0f172a]">API keys</h1>
        <p className="mt-1 max-w-2xl text-[16px] leading-relaxed text-[#64748b]">
          Use sandbox keys (<span className="font-mono">pk_test_…</span>) to test your integration. Live keys
          (<span className="font-mono">pk_live_…</span>) are issued only after activation. Treat secret keys
          like passwords — never commit them.
        </p>
        {keysError ? (
          <p className="mt-2 text-[14px] text-amber-800">{keysError}</p>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {/* Publishable keys card */}
          <KeyCard title="Publishable keys" subtitle="Safe to embed in client-side code (web, mobile).">
            {keysLoading ? (
              <KeyRowSkeleton />
            ) : (
              <KeyRow apiKey={sandboxPublishable} copyDisabled={!publishableValue} />
            )}
            <LiveLockedRow
              type="publishable"
              status={liveActivationStatus}
              canSwitch={canSwitchToLive}
              onActivate={() => setActivateOpen(true)}
            />
          </KeyCard>

          {/* Secret keys card */}
          <KeyCard
            title="Secret keys"
            subtitle="Server-side only. Anyone with this key can move money in your account."
            warning
          >
            {keysLoading ? (
              <KeyRowSkeleton />
            ) : (
              <KeyRow
                apiKey={sandboxSecret}
                masked
                copyDisabled={!secretValue || secretValue === '—'}
                rotateDisabled
              />
            )}
            <LiveLockedRow
              type="secret"
              status={liveActivationStatus}
              canSwitch={canSwitchToLive}
              onActivate={() => setActivateOpen(true)}
            />
          </KeyCard>

          {/* Recent API requests */}
          <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <header className="border-b border-[#E5E5E5] px-5 py-3">
              <p className="text-[17px] font-semibold text-[#0f172a]">Recent API requests</p>
              <p className="mt-0.5 text-[15px] text-[#64748b]">Last 10 calls. Use this to verify your integration is hitting the right endpoints.</p>
            </header>
            <table className="w-full text-left text-[16px]">
              <thead className="bg-[#fafafa] text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                <tr>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-4 py-2 text-right">Duration</th>
                  <th className="px-4 py-2 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#E5E5E5]">
                  <td colSpan={5} className="px-4 py-8 text-center text-[15px] text-[#94a3b8]">
                    No recent requests yet. Calls will appear here once your integration starts hitting the API.
                  </td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>

        {/* Right sidebar — recommendations */}
        <aside className="space-y-3">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Recommendations</p>
          <RecommendationCard
            icon="document"
            title="View API docs"
            body="OpenAPI reference, schema, and examples."
            href={SANDBOX_DOCS_LINKS.apiReference}
            external
          />
          <RecommendationCard
            icon="terminal"
            title="Postman collection"
            body="Pre-built requests with sandbox keys baked in."
            href={SANDBOX_DOCS_LINKS.postmanCollection}
            external
          />
          <RecommendationCard
            icon="bell"
            title="Webhooks setup"
            body="Receive real-time signals from Zord."
            href={SANDBOX_DOCS_LINKS.webhookGuide}
            external
            soon
          />
        </aside>
      </div>

      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function KeyCard({ title, subtitle, warning, children }: { title: string; subtitle: string; warning?: boolean; children: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <header className="border-b border-[#E5E5E5] px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px] font-semibold text-[#0f172a]">{title}</p>
          {warning ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[14px] font-semibold text-rose-700">
              <Glyph name="lock" className="h-2.5 w-2.5" />
              Sensitive
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[15px] text-[#64748b]">{subtitle}</p>
      </header>
      <div>{children}</div>
    </article>
  )
}

function KeyRowSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] px-5 py-3 first:border-t-0">
      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
      <div className="h-5 flex-1 animate-pulse rounded bg-slate-100" />
    </div>
  )
}

function KeyRow({
  apiKey,
  masked,
  copyDisabled,
  rotateDisabled,
}: {
  apiKey: DisplayApiKey
  masked?: boolean
  copyDisabled?: boolean
  rotateDisabled?: boolean
}) {
  const [revealed, setRevealed] = useState(!masked)
  const [copied, setCopied] = useState(false)

  const hasValue = apiKey.value && apiKey.value !== '—'
  const display = !hasValue
    ? '—'
    : revealed
      ? apiKey.value
      : `${apiKey.value.slice(0, 12)}${'•'.repeat(Math.max(0, apiKey.value.length - 16))}${apiKey.value.slice(-4)}`

  const onCopy = async () => {
    if (!hasValue || copyDisabled) return
    try {
      await navigator.clipboard.writeText(apiKey.value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] px-5 py-3 first:border-t-0">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/30 bg-[#FFF7ED] px-2 py-0.5 text-[14px] font-semibold uppercase tracking-[0.1em] text-[#9A3412]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
        Sandbox
      </span>
      <code className="flex-1 truncate font-mono text-[16px] text-[#0f172a]">{display}</code>
      <span className="text-[14px] text-[#94a3b8]">Last used {apiKey.lastUsedAt ?? 'never'}</span>
      <div className="flex items-center gap-1">
        {masked && hasValue ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
            aria-label={revealed ? 'Hide key' : 'Reveal key'}
          >
            <Glyph name={revealed ? 'eye-off' : 'eye'} className="h-3 w-3" />
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCopy}
          disabled={!hasValue || copyDisabled}
          className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Glyph name={copied ? 'check' : 'copy'} className="h-3 w-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
        {masked && !rotateDisabled ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
          >
            <Glyph name="refresh" className="h-3 w-3" />
            Rotate
          </button>
        ) : masked ? (
          <span
            className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-[#fafafa] px-2 py-1 text-[15px] font-medium text-[#94a3b8]"
            title="Contact support to rotate sandbox keys"
          >
            <Glyph name="refresh" className="h-3 w-3" />
            Rotate
          </span>
        ) : null}
      </div>
    </div>
  )
}

function LiveLockedRow({
  type,
  status,
  canSwitch,
  onActivate,
}: {
  type: 'publishable' | 'secret'
  status: 'not_started' | 'in_review' | 'active'
  canSwitch: boolean
  onActivate: () => void
}) {
  if (canSwitch) {
    return (
      <div className="flex items-center gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3 text-[15px] text-[#64748b]">
        Live {type} key issued — switch to Live mode in the dock to view.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#94a3b8]/30 bg-white px-2 py-0.5 text-[14px] font-semibold uppercase tracking-[0.1em] text-[#475569]">
        <Glyph name="lock" className="h-2.5 w-2.5" />
        Live
      </span>
      <span className="text-[15px] text-[#64748b]">
        {status === 'in_review'
          ? 'Activation submitted — live keys will be issued after approval.'
          : 'Activate live to issue your live keys.'}
      </span>
      {status !== 'in_review' ? (
        <button
          type="button"
          onClick={onActivate}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[6px] bg-[#0f172a] px-2.5 py-1 text-[15px] font-semibold text-white transition hover:bg-black"
        >
          Activate live
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 9 9 3M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

function RecommendationCard({
  icon,
  title,
  body,
  href,
  external,
  soon,
}: {
  icon: 'document' | 'terminal' | 'bell'
  title: string
  body: string
  href: string
  external?: boolean
  soon?: boolean
}) {
  const inner = (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-[#E5E5E5] bg-white p-3 transition hover:border-[#0f172a]/30 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#0f172a] text-white">
        <Glyph name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[16px] font-semibold text-[#0f172a]">{title}</p>
          {soon ? (
            <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#475569]">
              Soon
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[15px] leading-relaxed text-[#64748b]">{body}</p>
      </div>
      <Glyph name="arrow-up-right" className="h-3 w-3 shrink-0 text-[#94a3b8]" />
    </div>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="block">
        {inner}
      </a>
    )
  }
  return <Link href={href} className="block">{inner}</Link>
}
