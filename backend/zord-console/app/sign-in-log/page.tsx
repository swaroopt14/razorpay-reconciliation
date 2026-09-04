'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  SignInAuditTable,
  type SignInAuditPayload,
  type SignInAuditRow,
} from '@/features/internal/SignInAuditTable'

export default function SignInLogPage() {
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SignInAuditRow[]>([])
  const [source, setSource] = useState('')
  const [backend, setBackend] = useState('')
  const [fetchedAt, setFetchedAt] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadLog = useCallback(async () => {
    setLoadError(null)
    const res = await fetch('/api/internal/sign-in-log?limit=100', { cache: 'no-store' })
    if (res.status === 401) {
      setUnlocked(false)
      setRows([])
      return
    }
    const data = (await res.json()) as SignInAuditPayload
    if (!res.ok) {
      setLoadError(data.message || data.error || `Could not load sign-in log (${res.status}).`)
      setUnlocked(true)
      return
    }
    setUnlocked(true)
    setRows(Array.isArray(data.items) ? data.items : [])
    setSource(data.source || '')
    setBackend(data.status?.backend || data.source || '')
    setFetchedAt(data.fetched_at || '')
  }, [])

  useEffect(() => {
    void loadLog().finally(() => setLoading(false))
  }, [loadLog])

  async function onUnlock(event: FormEvent) {
    event.preventDefault()
    setGateError(null)
    const res = await fetch('/api/internal/sign-in-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      setGateError('Wrong password.')
      return
    }
    setPassword('')
    setUnlocked(true)
    setLoading(true)
    await loadLog()
    setLoading(false)
  }

  async function onLock() {
    await fetch('/api/internal/sign-in-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lock: true }),
    })
    setUnlocked(false)
    setRows([])
    setPassword('')
  }

  return (
    <main className="min-h-screen bg-[#F7F8FB] text-[#0B1324]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-[1120px] px-5 py-8 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Internal</p>
        <h1 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em]">Sign-in log</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#64748B]">
          Live rows from smoke <code className="text-[12px]">GET /v1/smoke/login-audit</code>. Passwords are never stored.
        </p>

        {!unlocked ? (
          <form
            onSubmit={onUnlock}
            className="mt-8 max-w-sm border border-[#D8DEE9] bg-white px-5 py-6"
          >
            <p className="text-[13px] font-semibold text-[#0B1324]">Password required</p>
            <p className="mt-1 text-[12px] text-[#64748B]">This page is not on the product nav. Use the internal password.</p>
            <label className="mt-4 block text-[12px] font-medium text-[#64748B]">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 h-10 w-full border border-[#D8DEE9] px-3 text-[13px] text-[#0B1324] outline-none focus:border-[#2E5BFF]"
              />
            </label>
            {gateError ? <p className="mt-2 text-[12px] text-[#C2413B]">{gateError}</p> : null}
            <button
              type="submit"
              className="mt-4 inline-flex h-10 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Open log
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => void onLock()}
                className="inline-flex h-9 items-center px-3 text-[13px] font-semibold text-[#64748B] hover:text-[#0B1324]"
              >
                Lock
              </button>
            </div>
            <SignInAuditTable
              rows={rows}
              loading={loading}
              error={loadError}
              backend={backend}
              source={source}
              fetchedAt={fetchedAt}
              onRefresh={() => void loadLog()}
            />
          </div>
        )}
      </div>
    </main>
  )
}
