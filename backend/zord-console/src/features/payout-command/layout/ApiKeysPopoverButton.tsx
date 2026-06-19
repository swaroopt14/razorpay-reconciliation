'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { SANDBOX_DOCS_LINKS } from '@/services/payout-command/sandbox-data'
import { Glyph } from '../shared'

type WorkspaceKeysPayload = {
  tenant_id: string
  tenant_name: string | null
  workspace_code: string | null
  publishable_key: string | null
  secret_key_prefix: string | null
}

export function ApiKeysPopoverButton({ label = 'API keys' }: { label?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [keys, setKeys] = useState<WorkspaceKeysPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [storedSecret, setStoredSecret] = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/sandbox/workspace-api-keys', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null
        setLoadError(j?.message || `Could not load keys (${res.status})`)
        setKeys(null)
        return
      }
      const body = (await res.json()) as WorkspaceKeysPayload
      setKeys(body)
      try {
        const stored = window.localStorage.getItem(`zord_tenant_api_key:${body.tenant_id}`)
        setStoredSecret(stored?.trim() || null)
      } catch {
        setStoredSecret(null)
      }
    } catch {
      setLoadError('Network error loading keys.')
      setKeys(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadKeys()
  }, [open, loadKeys])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const publishableDisplay = keys?.publishable_key ?? keys?.workspace_code ?? '—'
  const secretFull = storedSecret
  const secretDisplay =
    secretFull ??
    (keys?.secret_key_prefix ? `${keys.secret_key_prefix.slice(0, 16)}…` : '—')

  const docsBase =
    typeof process.env.NEXT_PUBLIC_ZORD_DOCS_URL === 'string' && process.env.NEXT_PUBLIC_ZORD_DOCS_URL.trim()
      ? process.env.NEXT_PUBLIC_ZORD_DOCS_URL.trim().replace(/\/$/, '')
      : null

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-9 items-center gap-1.5 rounded-[8px] border px-2.5 text-[14px] font-semibold transition ${
          open
            ? 'border-[#111111] bg-[#f4f4f2] text-[#111111]'
            : 'border-black/10 bg-white text-[#111111] hover:bg-[#fafafa]'
        }`}
      >
        <Glyph name="key" className="h-3.5 w-3.5 opacity-90" />
        {label}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90] cursor-default bg-black/10 sm:hidden"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-[min(calc(100vw-1.25rem),26rem)] overflow-hidden rounded-xl border border-black/[0.08] bg-[#f6f8fa] shadow-[0_16px_48px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]"
            role="dialog"
            aria-label="Sandbox API keys"
          >
            <div className="flex items-start justify-between gap-2 border-b border-black/[0.06] bg-[#f6f8fa] px-4 py-3">
              <p className="text-[15px] font-semibold text-[#30313d]">API keys</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-1.5 py-0.5 text-[18px] font-light leading-none text-[#6b7280] transition hover:bg-black/[0.06] hover:text-[#111827]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 pb-3 pt-2 text-[13px] leading-relaxed text-[#30313d]">
              <p>
                Use{' '}
                <a
                  href={SANDBOX_DOCS_LINKS.apiReference}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
                >
                  API reference
                </a>{' '}
                to wire authentication and payout intents.
              </p>
              <p>
                Design flows with{' '}
                <a
                  href={docsBase ? `${docsBase}/webhooks` : SANDBOX_DOCS_LINKS.webhookGuide}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
                >
                  webhooks
                </a>{' '}
                and bulk ingest for batch uploads.
              </p>
            </div>

            <div className="border-t border-black/[0.06] bg-white px-4 pb-4 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-[#30313d]">API keys</p>
                <a
                  href={SANDBOX_DOCS_LINKS.apiReference}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-[13px] font-medium text-[#000000] hover:text-[#15803d]"
                >
                  View docs
                </a>
              </div>
              <p className="mt-1 text-[12px] text-[#6b7280]">
                Sandbox · values from your signed-in workspace (no mock keys).
              </p>

              {loading ? (
                <p className="mt-4 text-[13px] text-[#6b7280]">Loading…</p>
              ) : loadError ? (
                <p className="mt-4 text-[13px] text-[#b45309]">{loadError}</p>
              ) : (
                <>
                  <CompactKeyRow label="Publishable key" value={publishableDisplay} />
                  <CompactKeyRow
                    label="Secret key"
                    value={secretFull ?? secretDisplay}
                    masked={!secretFull}
                    copyValue={secretFull ?? undefined}
                    helper={
                      !secretFull
                        ? 'Full secret is only shown once at signup; it is saved in this browser if you copied it then. Rotate from settings when supported.'
                        : undefined
                    }
                  />
                </>
              )}

              <Link
                href="/payout-command-view/settings/api-keys"
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#d1d5db] bg-white py-2.5 text-[13px] font-medium text-[#30313d] shadow-sm transition hover:bg-[#fafafa]"
                onClick={() => setOpen(false)}
              >
                Manage keys
                <Glyph name="arrow-up-right" className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function CompactKeyRow({
  label,
  value,
  masked,
  copyValue,
  helper,
  tone = 'default',
}: {
  label: string
  value: string
  masked?: boolean
  /** When masked preview differs from clipboard (full key in localStorage). */
  copyValue?: string
  helper?: string
  /** `imperial` — bold white on blue glass. `sky` — soft blue tint on light cards. */
  tone?: 'default' | 'imperial' | 'sky'
}) {
  const [revealed, setRevealed] = useState(!masked)
  const [copied, setCopied] = useState(false)

  const clipboardText = copyValue ?? value
  const display =
    revealed || !masked ? value : `${value.slice(0, 12)}${value.length > 16 ? '…' : ''}${value.slice(-4)}`

  const copy = async () => {
    if (!clipboardText || clipboardText === '—') return
    try {
      await navigator.clipboard.writeText(clipboardText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const imperial = tone === 'imperial'
  const sky = tone === 'sky'

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            imperial
              ? 'text-[12px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]'
              : sky
                ? 'text-[12px] font-medium text-[#5b6b8a]'
                : 'text-[12px] font-medium text-[#6b7280]'
          }
        >
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          {masked ? (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className={
                imperial
                  ? 'rounded-md p-1 font-bold text-white transition hover:bg-white/15 hover:text-white'
                  : 'rounded-md p-1 text-[#6b7280] transition hover:bg-black/5'
              }
              aria-label={revealed ? 'Hide key' : 'Reveal key'}
            >
              <Glyph name={revealed ? 'eye-off' : 'eye'} className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            disabled={!clipboardText || clipboardText === '—'}
            className={
              imperial
                ? 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold text-white transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40'
                : sky
                  ? 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#2563eb] transition hover:bg-[rgba(59,130,246,0.1)] disabled:pointer-events-none disabled:opacity-40'
                  : 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#000000] transition hover:bg-[rgba(0,0,0,0.12)] disabled:pointer-events-none disabled:opacity-40'
            }
          >
            <Glyph
              name={copied ? 'check' : 'copy'}
              className={imperial ? 'h-3 w-3 text-white' : sky ? 'h-3 w-3 text-[#3b82f6]' : 'h-3 w-3 text-[#000000]'}
            />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <code
        className={
          imperial
            ? 'block max-w-full truncate rounded-md border border-white/35 bg-white/15 px-2.5 py-2 font-mono text-[12px] font-bold leading-relaxed text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]'
            : sky
              ? 'block max-w-full truncate rounded-md border border-[#c5d5f0] bg-[#e8f0fe] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[#1e3a5f]'
              : 'block max-w-full truncate rounded-md border border-black/[0.06] bg-[rgba(0,0,0,0.06)] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[#1a1a2e]'
        }
      >
        {display}
      </code>
      {helper ? (
        <p
          className={
            imperial
              ? 'text-[11px] font-semibold leading-snug text-white/90'
              : sky
                ? 'text-[11px] leading-snug text-[#7b8aab]'
                : 'text-[11px] leading-snug text-[#9ca3af]'
          }
        >
          {helper}
        </p>
      ) : null}
    </div>
  )
}
