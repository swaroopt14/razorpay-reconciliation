'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Layout } from '@/components/aws'
import { getCurrentUser, isAuthenticated } from '@/services/auth'
import { format } from 'date-fns'

type PayoutContract = {
  contract_id: string
  tenant_id?: string
  intent_id?: string
  envelope_id?: string
  contract_hash?: string
  status?: string
  created_at?: string
}

function safeDate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function ConsoleIntentContractAliasPage() {
  const params = useParams()
  const router = useRouter()
  const intentId = params.intent_id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contracts, setContracts] = useState<PayoutContract[]>([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prod/payout-contracts', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load contracts: ${res.status}`)
      const data = await res.json()
      const items = Array.isArray(data?.items) ? (data.items as PayoutContract[]) : (Array.isArray(data) ? (data as PayoutContract[]) : [])
      const filtered = items.filter((c) => c.intent_id === intentId)

      // Deterministic pick order: created_at asc, then contract_id asc.
      filtered.sort((a, b) => {
        const at = safeDate(a.created_at)?.getTime() ?? 0
        const bt = safeDate(b.created_at)?.getTime() ?? 0
        if (at !== bt) return at - bt
        return (a.contract_id || '').localeCompare(b.contract_id || '')
      })

      setContracts(filtered)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts')
      setContracts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentId])

  const single = useMemo(() => (contracts.length === 1 ? contracts[0] : null), [contracts])

  useEffect(() => {
    if (!single) return
    router.replace(`/console/contracts/${encodeURIComponent(single.contract_id)}?intent_id=${encodeURIComponent(intentId)}`)
  }, [router, single, intentId])

  if (!isAuthenticated()) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Intents', 'Contract']} tenant={getCurrentUser()?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-gray-200 rounded shadow-sm p-6">
            <p className="text-sm text-gray-700">Please sign in to view contracts.</p>
            <div className="mt-4">
              <Link href="/console/login" className="text-blue-600 hover:text-blue-800 underline">Go to login</Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Intents', intentId, 'Contract']} tenant={getCurrentUser()?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-normal text-gray-900">
              Contracts for Intent - <span className="font-mono">{intentId}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              If exactly one contract exists, you will be redirected to the contract page automatically.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-sm text-gray-600">Loading…</td>
                </tr>
              ) : contracts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-sm text-gray-600">
                    No contracts found for this intent yet.
                  </td>
                </tr>
              ) : (
                contracts.map((c) => {
                  const created = safeDate(c.created_at)
                  return (
                    <tr key={c.contract_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{c.contract_id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{c.status || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {created ? format(created, 'yyyy-MM-dd HH:mm:ssXXX') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link href={`/console/contracts/${encodeURIComponent(c.contract_id)}`} className="text-blue-600 hover:text-blue-800">
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm text-gray-600">
          <Link href={`/console/ingestion/intents/${encodeURIComponent(intentId)}`} className="text-blue-600 hover:text-blue-800 underline">
            ← Back to Intent Detail
          </Link>
        </div>
      </div>
    </Layout>
  )
}

