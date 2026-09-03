'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type SimResult = {
  intentId: string
  envelopeId: string
  traceId: string
  createdAt: string
}

const makeSimId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`

export default function SandboxCreatePaymentPage() {
  const [amount, setAmount] = useState('25000')
  const [currency, setCurrency] = useState('INR')
  const [purposeCode, setPurposeCode] = useState('MERCHANT_SETTLEMENT')
  const [source, setSource] = useState('UPI')
  const [sourceSystem, setSourceSystem] = useState('RAZORPAY')
  const [instrumentKind, setInstrumentKind] = useState('BANK_ACCOUNT')
  const [payerToken, setPayerToken] = useState('payer_tok_demo_001')
  const [beneficiaryToken, setBeneficiaryToken] = useState('acct_tok_demo_987')
  const [result, setResult] = useState<SimResult | null>(null)

  const payload = useMemo(
    () => ({
      schema_version: 'intent.request.v1',
      intent_type: 'PAYMENT',
      amount: { value: amount, currency },
      purpose_code: purposeCode,
      source,
      source_system: sourceSystem,
      beneficiary: {
        instrument: { kind: instrumentKind },
        account_token: beneficiaryToken,
      },
      remitter: {
        payer_token: payerToken,
      },
      metadata: {
        env_id: 'SANDBOX',
        replay_safe: true,
        pii_mode: 'tokenized_only',
      },
    }),
    [amount, currency, purposeCode, source, sourceSystem, instrumentKind, payerToken, beneficiaryToken]
  )

  const runSimulation = () => {
    setResult({
      intentId: makeSimId('intent'),
      envelopeId: makeSimId('env'),
      traceId: makeSimId('trace'),
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Create Payment Request (Sandbox)</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Simulation only. No live fund movement and no plaintext PII.</p>
        </div>
        <Link href="/customer/sandbox/intents" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-cx-text hover:bg-gray-50">
          Back to Intent Journal
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Amount</label>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Currency</label>
            <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Purpose Code</label>
            <input value={purposeCode} onChange={(event) => setPurposeCode(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Source System</label>
            <input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Source</label>
            <input value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Instrument Kind</label>
            <input value={instrumentKind} onChange={(event) => setInstrumentKind(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Payer Token</label>
            <input value={payerToken} onChange={(event) => setPayerToken(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Beneficiary Account Token</label>
            <input value={beneficiaryToken} onChange={(event) => setBeneficiaryToken(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-cx-text outline-none focus:border-cx-purple-500" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={runSimulation} className="rounded-lg bg-cx-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cx-purple-700">
            Create Simulated Intent
          </button>
          <Link href="/customer/sandbox/intents/replay" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-cx-text hover:bg-gray-50">
            Open Replay
          </Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white">
          <header className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-cx-text">Tokenized Payload Preview</h2>
          </header>
          <pre className="overflow-auto p-4 text-xs font-mono text-cx-text">{JSON.stringify(payload, null, 2)}</pre>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Simulation Result</h2>
          {!result ? (
            <p className="mt-2 text-sm text-cx-neutral">Run simulation to generate `intent_id`, `envelope_id`, and `trace_id`.</p>
          ) : (
            <div className="mt-3 space-y-2 text-xs">
              <p className="font-mono text-cx-text">intent_id: {result.intentId}</p>
              <p className="font-mono text-cx-text">envelope_id: {result.envelopeId}</p>
              <p className="font-mono text-cx-text">trace_id: {result.traceId}</p>
              <p className="text-cx-neutral">created_at: {new Date(result.createdAt).toLocaleString('en-IN')}</p>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                Simulation complete. No live rails were touched.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
