'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { safeRandomId } from '@/shared/lib/safeRandomId'

type ValidationError = { code: string; message: string; field?: string }

type IngestResponse = {
  EnvelopeID?: string
  Received_At?: string
  Trace_id?: string
  error?: unknown
}

type IntentRequestV1 = {
  schema_version: 'intent.request.v1'
  intent_type: string
  account_number: string
  amount: { value: string; currency: string }
  beneficiary: { instrument: { kind: string }; country: string }
  remitter: { customer_id: string }
  constraints: { execution_window: string }
  purpose_code: string
  source: string
  source_system: string
}

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function genIdempotencyKey(): string {
  // Idempotency keys can be random (not part of canonical/salient).
  return `idem_${safeRandomId()}`
}

function parsePositiveDecimal(input: string): { ok: boolean; normalized?: string } {
  const s = input.trim()
  if (!s) return { ok: false }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return { ok: false }
  const normalized = s.replace(/^0+(\d)/, '$1')
  return { ok: true, normalized }
}

function validatePayload(p: IntentRequestV1): ValidationError[] {
  const errs: ValidationError[] = []

  if (!p.account_number.trim()) errs.push({ code: 'REQUIRED', field: 'account_number', message: 'Account Number is required.' })

  const amt = parsePositiveDecimal(p.amount.value)
  if (!amt.ok) errs.push({ code: 'AMOUNT_INVALID', field: 'amount.value', message: 'Amount must be a positive decimal number.' })

  if (!p.amount.currency.trim()) errs.push({ code: 'REQUIRED', field: 'amount.currency', message: 'Currency is required.' })
  if (!p.beneficiary.instrument.kind.trim()) errs.push({ code: 'REQUIRED', field: 'beneficiary.instrument.kind', message: 'Instrument Kind is required.' })
  if (!p.beneficiary.country.trim()) errs.push({ code: 'REQUIRED', field: 'beneficiary.country', message: 'Country is required.' })
  if (!p.remitter.customer_id.trim()) errs.push({ code: 'REQUIRED', field: 'remitter.customer_id', message: 'Customer ID is required.' })
  if (!p.constraints.execution_window.trim()) errs.push({ code: 'REQUIRED', field: 'constraints.execution_window', message: 'Execution Window is required.' })
  if (!p.purpose_code.trim()) errs.push({ code: 'REQUIRED', field: 'purpose_code', message: 'Purpose Code is required.' })
  if (!p.source.trim()) errs.push({ code: 'REQUIRED', field: 'source', message: 'Source is required.' })
  if (!p.source_system.trim()) errs.push({ code: 'REQUIRED', field: 'source_system', message: 'Source System is required.' })
  if (!p.intent_type.trim()) errs.push({ code: 'REQUIRED', field: 'intent_type', message: 'Intent Type is required.' })

  return errs
}

export default function CustomerCreateIntentPage() {
  const [apiKey, setApiKey] = useState<string>('')
  const [tenantName, setTenantName] = useState<string>('')
  const [idempotencyKey, setIdempotencyKey] = useState<string>(genIdempotencyKey())

  const [accountNumber, setAccountNumber] = useState('ACC55knkn5000')
  const [amountValue, setAmountValue] = useState('1555.009')
  const [currency, setCurrency] = useState('INR')
  const [instrumentKind, setInstrumentKind] = useState('WALLET')
  const [country, setCountry] = useState('GB')
  const [customerId, setCustomerId] = useState('CUST-12kjkj345')
  const [executionWindow, setExecutionWindow] = useState('T+1')
  const [purposeCode, setPurposeCode] = useState('TREASURY')
  const [source, setSource] = useState('UPI')
  const [sourceSystem, setSourceSystem] = useState('Razorpay')
  const [intentType, setIntentType] = useState('FX')

  const [validatedOnce, setValidatedOnce] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resp, setResp] = useState<IngestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const k = localStorage.getItem('cx_api_key') || ''
    const t = localStorage.getItem('cx_tenant_name') || ''
    setApiKey(k)
    setTenantName(t)
  }, [])

  const payload: IntentRequestV1 = useMemo(
    () => ({
      schema_version: 'intent.request.v1',
      intent_type: intentType,
      account_number: accountNumber,
      amount: { value: amountValue, currency },
      beneficiary: { instrument: { kind: instrumentKind }, country },
      remitter: { customer_id: customerId },
      constraints: { execution_window: executionWindow },
      purpose_code: purposeCode,
      source,
      source_system: sourceSystem,
    }),
    [
      intentType,
      accountNumber,
      amountValue,
      currency,
      instrumentKind,
      country,
      customerId,
      executionWindow,
      purposeCode,
      source,
      sourceSystem,
    ]
  )

  const validationErrors = useMemo(() => validatePayload(payload), [payload])
  const status: 'draft' | 'validated' | 'invalid' = useMemo(() => {
    if (!validatedOnce) return 'draft'
    return validationErrors.length === 0 ? 'validated' : 'invalid'
  }, [validatedOnce, validationErrors.length])

  const previewJson = useMemo(() => safeJsonStringify(payload), [payload])

  const onValidate = () => {
    setValidatedOnce(true)
    setError(null)
    setResp(null)
  }

  const onCopyJson = async () => {
    await navigator.clipboard.writeText(previewJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const onSubmit = async () => {
    setValidatedOnce(true)
    setError(null)
    setResp(null)

    if (!apiKey) {
      setError('Missing API key. Register a tenant first.')
      return
    }

    if (validationErrors.length > 0) {
      setError('Fix validation errors before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/prod/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      let data: IngestResponse = {}
      try {
        data = JSON.parse(text) as IngestResponse
      } catch {
        data = { error: text }
      }

      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Ingest failed: ${res.status}`)
      }

      setResp(data)
      setIdempotencyKey(genIdempotencyKey())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ingest failed')
    } finally {
      setSubmitting(false)
    }
  }

  const badge = (() => {
    if (status === 'validated') return { label: 'Validated', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' }
    if (status === 'invalid') return { label: 'Invalid', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' }
    return { label: 'Draft', bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' }
  })()

  return (
    <div className="p-6">
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-cx-text">Create Payment Request</h1>
            <p className="text-sm text-cx-neutral mt-0.5">
              Active Schema: <span className="font-mono">intent.request.v1</span> · Deterministic intent request payload
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-white text-cx-neutral border border-gray-200">
              {tenantName ? `Tenant: ${tenantName}` : 'Tenant: (not set)'}
            </span>
            <Link
              href="/customer/tenant/register"
              className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Register Tenant
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-6 shadow-[var(--cx-card-shadow)]">
          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-cx-text">Auth</h2>
                <span className="text-[11px] text-cx-neutral">
                  API key is read from <span className="font-mono">localStorage</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">API Key</label>
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="(from tenant registration)"
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  />
                  <p className="mt-2 text-[11px] text-cx-neutral">
                    Stored as <span className="font-mono">cx_api_key</span>. Keep this secret.
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    X-Idempotency-Key <span className="text-red-600">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={idempotencyKey}
                      onChange={(e) => setIdempotencyKey(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono"
                    />
                    <button
                      onClick={() => setIdempotencyKey(genIdempotencyKey())}
                      className="px-3 py-2 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Generate a new unique key"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-gray-100" />

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Account Info</h2>
              <div className="mt-3">
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                  Account Number <span className="text-red-600">*</span>
                </label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono"
                />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Amount</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Amount Value <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={amountValue}
                    onChange={(e) => setAmountValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono tabular-nums"
                    placeholder="1555.009"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Currency <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['INR', 'AED', 'SAR', 'USD', 'EUR', 'GBP'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Beneficiary</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Instrument Kind <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={instrumentKind}
                    onChange={(e) => setInstrumentKind(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['WALLET', 'BANK', 'CARD'].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Country <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['IN', 'AE', 'SA', 'GB', 'US'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Remitter</h2>
              <div className="mt-3">
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                  Customer ID <span className="text-red-600">*</span>
                </label>
                <input
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono"
                />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Constraints</h2>
              <div className="mt-3">
                <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                  Execution Window <span className="text-red-600">*</span>
                </label>
                <select
                  value={executionWindow}
                  onChange={(e) => setExecutionWindow(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                >
                  {['T+0', 'T+1', 'T+2'].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-cx-text">Meta</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Purpose Code <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={purposeCode}
                    onChange={(e) => setPurposeCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['TREASURY', 'SALARY', 'VENDOR', 'REFUND'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Intent Type <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={intentType}
                    onChange={(e) => setIntentType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['FX', 'PAYOUT'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Source <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                  >
                    {['UPI', 'BANK_TRANSFER', 'CARD'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-cx-neutral uppercase tracking-wider mb-2">
                    Source System <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={sourceSystem}
                    onChange={(e) => setSourceSystem(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
                    placeholder="Razorpay"
                  />
                </div>
              </div>
            </section>

            {validatedOnce && validationErrors.length > 0 ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-xs font-semibold text-rose-800 mb-1">Validation Errors</div>
                <ul className="text-xs text-rose-700 list-disc pl-4 space-y-1">
                  {validationErrors.map((e, idx) => (
                    <li key={idx}>
                      <span className="font-mono">{e.code}</span>: {e.message}
                      {e.field ? <span className="ml-2 text-rose-600">({e.field})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            ) : null}

            {resp?.EnvelopeID ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-emerald-800">Submitted</div>
                    <div className="mt-1 text-xs text-emerald-700">
                      EnvelopeID: <span className="font-mono font-semibold">{resp.EnvelopeID}</span>
                    </div>
                    {resp.Received_At ? (
                      <div className="mt-1 text-xs text-emerald-700">
                        Received_At: <span className="font-mono">{resp.Received_At}</span>
                      </div>
                    ) : null}
                    {resp.Trace_id ? (
                      <div className="mt-1 text-xs text-emerald-700">
                        Trace_id: <span className="font-mono">{resp.Trace_id}</span>
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href="/customer/intents"
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    View Journal
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setValidatedOnce(false)
                  setError(null)
                  setResp(null)
                }}
                className="px-4 py-2 text-sm font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onValidate}
                  className="px-4 py-2 text-sm font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Validate
                </button>
                <button
                  onClick={onSubmit}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Submit Intent'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-[var(--cx-card-shadow)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-cx-text">Request Preview (Live)</h2>
              <p className="text-xs text-cx-neutral mt-0.5">This is the exact payload sent to `POST /v1/ingest`.</p>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${badge.bg} ${badge.text} border-gray-200`}>
              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
              <span className="text-xs font-semibold">{badge.label}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">JSON</span>
              <button
                onClick={onCopyJson}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <pre className="p-3 text-[11px] font-mono text-cx-text overflow-auto max-h-[540px]">{previewJson}</pre>
          </div>

          <div className="mt-4 text-xs text-cx-neutral">
            Tip: If you are getting <span className="font-mono">UNAUTHORIZED</span>, verify the API key from{' '}
            <Link href="/customer/tenant/register" className="text-cx-purple-700 font-semibold hover:underline">
              Tenant Registration
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export for embedding outside the /customer route (e.g. as a tab inside
// Batch Command Center). Same component, same behavior - page metadata is at
// the route level so reusing the body has no side effects.
export { CustomerCreateIntentPage as CreatePaymentRequestForm }

