'use client'

import { useMemo, useState } from 'react'

const requiredColumns = [
  'row_id',
  'intent_type',
  'amount_value',
  'currency',
  'beneficiary_account_token',
  'payer_token',
  'purpose_code',
]

const sampleErrors = [
  { row: 18, code: 'SCHEMA_MISSING_COLUMN', message: 'Missing `payer_token`' },
  { row: 42, code: 'AMOUNT_INVALID', message: 'amount_value must be positive decimal' },
  { row: 51, code: 'TOKEN_FORMAT_INVALID', message: 'beneficiary_account_token not in token format' },
]

export default function CustomerFileUploadPage() {
  const [fileName, setFileName] = useState<string>('')
  const [templateVersion] = useState('csv.intent.bulk.v1')
  const [jobQueued, setJobQueued] = useState(false)
  const [simulateErrors, setSimulateErrors] = useState(true)

  const previewRows = useMemo(
    () => [
      {
        row_id: 'row_001',
        intent_type: 'PAYMENT',
        amount_value: '12500.00',
        currency: 'INR',
        beneficiary_account_token: 'acct_tok_ab12...9012',
        payer_token: 'payer_tok_aa22...cc44',
        purpose_code: 'MERCHANT_SETTLEMENT',
      },
      {
        row_id: 'row_002',
        intent_type: 'REFUND',
        amount_value: '850.50',
        currency: 'INR',
        beneficiary_account_token: 'acct_tok_ff90...1010',
        payer_token: 'payer_tok_3f33...bc91',
        purpose_code: 'CUSTOMER_REFUND',
      },
    ],
    []
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-cx-text">File Ingestion & Bulk CSV Upload</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Upload tokenized CSV batches for intent ingestion (live customer environment).</p>
        </div>
        <button
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-cx-text hover:bg-gray-50"
          onClick={() => window.dispatchEvent(new CustomEvent('cx:toast', { detail: { title: 'Template downloaded', type: 'success' } }))}
        >
          Download CSV Template
        </button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-cx-text">Upload</h2>
          <p className="text-xs text-cx-neutral mt-1">Only tokenized IDs accepted. Plain PII is rejected at validation.</p>
          <label className="mt-4 block rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-6 text-center cursor-pointer">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                setFileName(file?.name || '')
                setJobQueued(false)
              }}
            />
            <p className="text-sm font-medium text-cx-text">{fileName || 'Drop CSV or click to choose file'}</p>
            <p className="text-xs text-cx-neutral mt-1">Max 50 MB • UTF-8 • delimiter: comma</p>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Template Version</label>
              <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-cx-text">{templateVersion}</div>
            </div>
            <label className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-cx-text">Inject sample validation errors</span>
              <input type="checkbox" checked={simulateErrors} onChange={() => setSimulateErrors((v) => !v)} />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              disabled={!fileName}
              onClick={() => setJobQueued(Boolean(fileName))}
              className="rounded-lg bg-cx-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cx-purple-700 disabled:opacity-50"
            >
              Validate & Queue Ingestion
            </button>
            {jobQueued ? <span className="text-xs text-emerald-700">Job queued: `ing_job_20260302_001`</span> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-cx-text">Schema Guardrails</h2>
          <p className="text-xs text-cx-neutral mt-1">Required columns for `csv.intent.bulk.v1`</p>
          <ul className="mt-3 space-y-2">
            {requiredColumns.map((col) => (
              <li key={col} className="rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2 text-xs font-mono text-cx-text">
                {col}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-cx-text">Pre-validation Preview</h2>
        </header>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              {requiredColumns.map((column) => (
                <th key={column} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {previewRows.map((row) => (
              <tr key={row.row_id}>
                {requiredColumns.map((column) => (
                  <td key={`${row.row_id}_${column}`} className="px-4 py-2.5 text-xs font-mono text-cx-text">
                    {row[column as keyof typeof row]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {simulateErrors ? (
        <section className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
          <h2 className="text-sm font-semibold text-red-700">Validation Errors (sample)</h2>
          <ul className="mt-2 space-y-1.5">
            {sampleErrors.map((error) => (
              <li key={`${error.row}_${error.code}`} className="text-xs text-red-700">
                row {error.row} • {error.code} • {error.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
