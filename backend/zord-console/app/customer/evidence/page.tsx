'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'

type ContractRow = {
  contract_id: string
  tenant_id?: string
  intent_id?: string
  envelope_id?: string
  contract_hash?: string
  status?: string
  created_at?: string
}

type EnvelopeRow = {
  envelope_id: string
  tenant_id?: string
  source?: string
  parse_status?: string
  signature_status?: string
  sha256?: string
  received_at?: string
}

function safeDate(v?: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function EvidencePacksPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [envelopes, setEnvelopes] = useState<EnvelopeRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [contractsRes, envelopesRes] = await Promise.all([
          fetch('/api/prod/payout-contracts', { cache: 'no-store' }),
          fetch('/api/prod/raw-envelopes?page=1&page_size=200', { cache: 'no-store' }),
        ])

        if (!contractsRes.ok) throw new Error(`Contracts API failed: ${contractsRes.status}`)
        if (!envelopesRes.ok) throw new Error(`Envelopes API failed: ${envelopesRes.status}`)

        const contractsData = await contractsRes.json()
        const envelopesData = await envelopesRes.json()

        setContracts(Array.isArray(contractsData?.items) ? contractsData.items : [])
        setEnvelopes(Array.isArray(envelopesData?.items) ? envelopesData.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load evidence data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const envelopeMap = useMemo(() => {
    const map = new Map<string, EnvelopeRow>()
    for (const env of envelopes) map.set(env.envelope_id, env)
    return map
  }, [envelopes])

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of contracts) if (c.status) set.add(c.status)
    return Array.from(set).sort()
  }, [contracts])

  const rows = useMemo(() => {
    let data = contracts
    if (statusFilter !== 'all') data = data.filter((c) => c.status === statusFilter)
    return [...data].sort((a, b) => {
      const at = safeDate(a.created_at)?.getTime() ?? 0
      const bt = safeDate(b.created_at)?.getTime() ?? 0
      return bt - at
    })
  }, [contracts, statusFilter])

  const totalContracts = contracts.length
  const issuedContracts = contracts.filter((c) => (c.status || '').toUpperCase() === 'ISSUED').length
  const linkedEnvelopes = contracts.filter((c) => c.envelope_id && envelopeMap.has(c.envelope_id)).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Evidence Packs</h1>
          <p className="text-sm text-cx-neutral mt-0.5">
            Live linkage between contracts and raw envelopes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/customer/evidence/explorer"
            className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Open Explorer
          </Link>
          <Link
            href="/customer/evidence/export"
            className="px-3 py-1.5 text-xs font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors"
          >
            Export Center
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-cx-purple-500 p-4">
          <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Contracts</p>
          <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{totalContracts}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-cx-teal-500 p-4">
          <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Issued</p>
          <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{issuedContracts}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-cx-orange-500 p-4">
          <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Raw Envelopes</p>
          <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{envelopes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-cx-purple-500 p-4">
          <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Linked Envelope IDs</p>
          <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{linkedEnvelopes}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-cx-text"
        >
          <option value="all">All contract statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Contract</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Envelope</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Contract Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Parse Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Hash</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-sm text-cx-neutral">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-sm text-cx-neutral">
                  No contracts found.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const env = c.envelope_id ? envelopeMap.get(c.envelope_id) : undefined
                const created = safeDate(c.created_at)
                return (
                  <tr key={c.contract_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-cx-purple-600">
                      <Link
                        href={`/customer/evidence/explorer?contract_id=${encodeURIComponent(c.contract_id)}${c.envelope_id ? `&envelope_id=${encodeURIComponent(c.envelope_id)}` : ''}`}
                        className="hover:underline"
                      >
                        {c.contract_id}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{c.intent_id || '-'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{c.envelope_id || '-'}</td>
                    <td className="px-5 py-3 text-xs text-cx-text">{c.status || '-'}</td>
                    <td className="px-5 py-3 text-xs text-cx-text">{env?.parse_status || '-'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{c.contract_hash || '-'}</td>
                    <td className="px-5 py-3 text-xs text-cx-neutral">
                      {created ? format(created, 'yyyy-MM-dd HH:mm:ss') : '-'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

