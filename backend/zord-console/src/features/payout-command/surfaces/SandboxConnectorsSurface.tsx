'use client'

import { useState } from 'react'
import {
  PROVIDER_CATALOG,
  useConnectedProviders,
  type ConnectedProvider,
  type ProviderId,
  type ProviderKind,
} from '@/services/payout-command/connected-providers-store'
import { EntityLogo } from '../entity-logo'
import { Glyph } from '../shared'

/**
 * SandboxConnectorsSurface — sandbox-only Connectors page.
 *
 * Replaces the full Connector Intelligence (which is for ops teams analysing
 * live PSP performance — out of place in sandbox where the user hasn't even
 * connected anything yet).
 *
 * Two states:
 *   1. Empty (zero connected) → big prompt + 7 provider cards (4 PSP + 3 banks)
 *   2. Has connections        → list of connected providers with health pill,
 *                                rails, sandbox API key (masked), webhook URL,
 *                                + grid of remaining catalog entries to connect
 *
 * Live mode keeps using the full Connector Intelligence dashboard (unchanged).
 */

export function SandboxConnectorsSurface() {
  const { providers, connectProvider, disconnectProvider } = useConnectedProviders()
  const [connectingId, setConnectingId] = useState<ProviderId | null>(null)

  const connectedIds = new Set(providers.map((p) => p.id))
  const remaining = PROVIDER_CATALOG.filter((p) => !connectedIds.has(p.id))

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-[#fafafa] p-6 lg:p-8">
      <div className="mx-auto max-w-[1100px] space-y-6">
        {/* Page header */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/30 bg-[#FFF7ED] px-2.5 py-0.5 text-[16px] font-semibold uppercase tracking-[0.12em] text-[#9A3412]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
              Sandbox · Connectors
            </span>
            <p className="mt-3 max-w-2xl text-[20px] leading-relaxed text-[#64748b]">
              Connect a payment provider or bank to start dispatching test intents. Sandbox uses test
              credentials only — no real funds move. You can connect multiple providers and switch between rails.
            </p>
          </div>
          <span className="rounded-full border border-[#E5E5E5] bg-white px-3 py-1 text-[18px] font-medium text-[#475569]">
            {providers.length} connected · {remaining.length} available
          </span>
        </header>

        {/* Empty state — show only when zero providers connected */}
        {providers.length === 0 ? (
          <article className="rounded-[16px] border-2 border-dashed border-[#E5E5E5] bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#0f172a] text-white">
              <Glyph name="shield" className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.01em] text-[#0f172a]">
              Connect your first provider to start
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-[18px] leading-relaxed text-[#64748b]">
              Pick any of the providers below. Paste your sandbox API key (we&apos;ll never use it for live
              traffic). Once connected, you can run scenarios and dispatch test batches through that rail.
            </p>
          </article>
        ) : null}

        {/* Connected providers list */}
        {providers.length > 0 ? (
          <section>
            <h2 className="mb-2 text-[16px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Connected</h2>
            <ul className="space-y-2">
              {providers.map((provider) => (
                <ConnectedRow
                  key={provider.id}
                  provider={provider}
                  onDisconnect={() => disconnectProvider(provider.id)}
                  onReconnect={() => setConnectingId(provider.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Catalog of providers to connect */}
        {remaining.length > 0 ? (
          <section>
            <h2 className="mb-2 text-[16px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
              Available providers
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {remaining.map((p) => (
                <ProviderCard
                  key={p.id}
                  id={p.id}
                  kind={p.kind}
                  name={p.name}
                  description={p.description}
                  onConnect={() => setConnectingId(p.id)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {connectingId ? (
        <ConnectModal
          providerId={connectingId}
          onClose={() => setConnectingId(null)}
          onConfirm={(apiKey, webhookUrl) => {
            connectProvider(connectingId, apiKey, webhookUrl)
            setConnectingId(null)
          }}
        />
      ) : null}
    </div>
  )
}

// ─── ConnectedRow ──────────────────────────────────────────────────────────────

function ConnectedRow({
  provider,
  onDisconnect,
  onReconnect,
}: {
  provider: ConnectedProvider
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const healthTone =
    provider.health === 'healthy'
      ? 'border-black/30 bg-neutral-100 text-black'
      : provider.health === 'degraded'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'
  return (
    <li>
      <article className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#E5E5E5] bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
        <EntityLogo name={provider.name} kind={provider.kind} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[20px] font-semibold text-[#0f172a]">{provider.name}</p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[16px] font-semibold ${healthTone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                provider.health === 'healthy' ? 'bg-black' : provider.health === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'
              }`} aria-hidden />
              {provider.health}
            </span>
            <span className="text-[17px] text-[#64748b]">· {provider.rails.join(' · ')}</span>
          </div>
          <p className="mt-0.5 font-mono text-[17px] text-[#0f172a]">{provider.apiKeyDisplay}</p>
          <p className="mt-0.5 truncate font-mono text-[16px] text-[#94a3b8]" title={provider.webhookUrl}>
            ↳ {provider.webhookUrl}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReconnect}
            className="rounded-[6px] border border-[#E5E5E5] bg-white px-2.5 py-1 text-[17px] font-medium text-[#475569] transition hover:bg-[#fafafa]"
          >
            Update credentials
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-[6px] border border-rose-200 bg-white px-2.5 py-1 text-[17px] font-medium text-rose-700 transition hover:bg-rose-50"
          >
            Disconnect
          </button>
        </div>
      </article>
    </li>
  )
}

// ─── ProviderCard (catalog entry for empty / available) ────────────────────────

function ProviderCard({
  id,
  kind,
  name,
  description,
  onConnect,
}: {
  id: ProviderId
  kind: ProviderKind
  name: string
  description: string
  onConnect: () => void
}) {
  return (
    <article className="flex flex-col rounded-[14px] border border-[#E5E5E5] bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition hover:border-[#0f172a]/30">
      <div className="flex items-center gap-2.5">
        <EntityLogo name={name} kind={kind} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-semibold text-[#0f172a]">{name}</p>
          <p className="text-[17px] text-[#64748b]">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onConnect}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[#0f172a] px-3 py-2 text-[18px] font-semibold text-white transition hover:bg-black"
      >
        Connect {name}
        <Glyph name="arrow-up-right" className="h-3 w-3" />
      </button>
      <p className="mt-2 text-center font-mono text-[15px] uppercase tracking-wider text-[#94a3b8]">
        provider_id: {id}
      </p>
    </article>
  )
}

// ─── ConnectModal ──────────────────────────────────────────────────────────────

function ConnectModal({
  providerId,
  onClose,
  onConfirm,
}: {
  providerId: ProviderId
  onClose: () => void
  onConfirm: (apiKey: string, webhookUrl: string) => void
}) {
  const meta = PROVIDER_CATALOG.find((p) => p.id === providerId)!
  const [apiKey, setApiKey] = useState('')
  const [webhookUrl, setWebhookUrl] = useState(`https://api.zord.com/sandbox/webhooks/${providerId}`)

  const isValid = apiKey.trim().length >= 8

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default bg-black/30 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[90] w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start gap-3 border-b border-[#E5E5E5] px-5 py-4">
          <EntityLogo name={meta.name} kind={meta.kind} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Sandbox connection</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.01em] text-[#0f172a]">Connect {meta.name}</h2>
            <p className="mt-1 text-[18px] text-[#64748b]">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[18px] text-[#475569] transition hover:bg-[#fafafa]"
          >
            Close
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <Field
            label="Sandbox API key"
            placeholder={meta.kind === 'psp' ? 'rzp_test_xxxxxxxxxxxx' : 'sk_test_xxxxxxxxxxxx'}
            value={apiKey}
            onChange={setApiKey}
            mono
          />
          <Field
            label="Webhook URL"
            value={webhookUrl}
            onChange={setWebhookUrl}
            mono
            hint="Zord will send signal callbacks to this endpoint."
          />
          <div className="rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] p-3 text-[17px] leading-relaxed text-[#475569]">
            We never use sandbox credentials for live traffic. Switch to a live account to add real keys.
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[18px] font-medium text-[#475569] transition hover:bg-[#f3f3ee]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={() => onConfirm(apiKey, webhookUrl)}
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[18px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect
            <Glyph name="check" className="h-3 w-3" />
          </button>
        </footer>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-[16px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 h-9 w-full rounded-[8px] border border-[#E5E5E5] bg-white px-3 text-[18px] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f172a]/40 focus:ring-2 focus:ring-[#0f172a]/10 ${mono ? 'font-mono' : ''}`}
      />
      {hint ? <p className="mt-1 text-[17px] text-[#64748b]">{hint}</p> : null}
    </label>
  )
}
