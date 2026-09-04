'use client'

import { useEffect, useMemo, useState } from 'react'

type TenantRegResponse = {
  APIKEY?: string
  Message?: string
  TenantId?: string
}

function maskApiKey(key: string): string {
  if (key.length <= 12) return '***'
  return `${key.slice(0, 6)}…${key.slice(-6)}`
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export default function CustomerTenantRegisterPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resp, setResp] = useState<TenantRegResponse | null>(null)
  const [copied, setCopied] = useState<'apikey' | 'tenant' | null>(null)

  useEffect(() => {
    // Avoid duplicate-tenant 500s by defaulting to a unique name on first mount.
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
    setName(`merchant_${ts}`)
  }, [])

  const canSubmit = useMemo(() => name.trim().length >= 3, [name])

  const copy = async (kind: 'apikey' | 'tenant', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1200)
  }

  const onRegister = async () => {
    setLoading(true)
    setError(null)
    setResp(null)
    try {
      const res = await fetch('/api/prod/tenant-reg', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const text = await res.text()
      const data = (safeJsonParse(text) || {}) as TenantRegResponse

      if (!res.ok) {
        const friendly =
          (data as any)?.error === 'TENANT_NAME_EXISTS'
            ? 'Tenant name already exists. Update the name and try again.'
            : (data as any)?.message || (data as any)?.error || `Tenant registration failed: ${res.status}`
        throw new Error(friendly)
      }

      setResp(data)

      // Persist for customer create-intent page convenience.
      if (data.APIKEY) localStorage.setItem('cx_api_key', data.APIKEY)
      if (data.TenantId) localStorage.setItem('cx_tenant_id', data.TenantId)
      localStorage.setItem('cx_tenant_name', name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tenant registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Tenant Registration</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Registers a tenant and returns an API key for ingestion (SANDBOX/PROD)</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-2">
              Tenant Name <span className="text-red-600">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="abcd211"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
            />
            <p className="mt-2 text-xs text-cx-neutral">
              This calls `POST /v1/tenantReg` via console proxy. No secrets are logged.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <p className="text-xs font-semibold text-cx-neutral uppercase tracking-wider">Local Storage</p>
            <p className="mt-2 text-xs text-cx-neutral">
              On success, saves `cx_api_key`, `cx_tenant_id`, `cx_tenant_name` for Create Intent page.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onRegister}
            disabled={!canSubmit || loading}
            className="px-4 py-2 text-sm font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registering…' : 'Register Tenant'}
          </button>
          <button
            type="button"
            onClick={() => {
              const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
              setName(`merchant_${ts}`)
            }}
            className="px-4 py-2 text-sm font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Generate Name
          </button>
          <button
            onClick={() => {
              setResp(null)
              setError(null)
            }}
            className="px-4 py-2 text-sm font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {resp ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-cx-text">Response</h2>
            <p className="text-xs text-cx-neutral mt-0.5">{resp.Message || 'Merchent Registered'}</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-cx-neutral">TenantId</p>
                <p className="text-sm font-mono text-cx-text truncate">{resp.TenantId || '-'}</p>
              </div>
              {resp.TenantId ? (
                <button
                  onClick={() => copy('tenant', resp.TenantId!)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied === 'tenant' ? 'Copied' : 'Copy'}
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-cx-neutral">APIKEY</p>
                <p className="text-sm font-mono text-cx-text truncate">{resp.APIKEY ? maskApiKey(resp.APIKEY) : '-'}</p>
                <p className="mt-1 text-[11px] text-cx-neutral">Masked. Use Copy to get the full key.</p>
              </div>
              {resp.APIKEY ? (
                <button
                  onClick={() => copy('apikey', resp.APIKEY!)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied === 'apikey' ? 'Copied' : 'Copy'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
