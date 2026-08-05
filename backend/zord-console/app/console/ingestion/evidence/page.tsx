'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Layout, PageHeader } from '@/components/aws'
import { getCurrentUser, isAuthenticated } from '@/services/auth'

type ContractRow = {
  contract_id: string
  intent_id: string
  envelope_id: string
  status: string
  contract_hash?: string
  created_at: string
}

type EnvelopeRow = {
  envelope_id: string
  parse_status?: string
}

export default function EvidencePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [envelopeIndex, setEnvelopeIndex] = useState<Record<string, EnvelopeRow>>({})

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    void load()
  }, [router])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [contractsRes, envelopesRes] = await Promise.all([
        fetch('/api/prod/payout-contracts', { cache: 'no-store' }),
        fetch('/api/prod/raw-envelopes?page=1&page_size=200', { cache: 'no-store' }),
      ])

      if (!contractsRes.ok) {
        throw new Error(`Contracts API failed: ${contractsRes.status}`)
      }

      const contractsBody = (await contractsRes.json()) as { items?: ContractRow[] }
      const envelopesBody = envelopesRes.ok
        ? ((await envelopesRes.json()) as { items?: EnvelopeRow[] })
        : { items: [] }

      const c = Array.isArray(contractsBody.items) ? contractsBody.items : []
      const e = Array.isArray(envelopesBody.items) ? envelopesBody.items : []
      const idx: Record<string, EnvelopeRow> = {}
      for (const item of e) idx[item.envelope_id] = item

      setContracts(c)
      setEnvelopeIndex(idx)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load evidence')
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(
    () =>
      contracts
        .filter((c) => !!c.contract_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [contracts]
  )

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Evidence Explorer']} tenant={getCurrentUser()?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Evidence Explorer"
          description="Contract and envelope evidence links"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Ingestion', href: '/console/ingestion' },
            { label: 'Evidence Explorer' },
          ]}
        />

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">{rows.length} linked evidence records</p>
          <button
            onClick={() => void load()}
            className="px-3 py-2 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Envelope</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parse Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-sm text-gray-500">Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-sm text-gray-500">No evidence records found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.contract_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{row.contract_id}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/console/ingestion/intents/${encodeURIComponent(row.intent_id)}`}
                        className="font-mono text-xs text-blue-600 hover:text-blue-800"
                      >
                        {row.intent_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/console/ingestion/raw-envelopes/${encodeURIComponent(row.envelope_id)}`}
                        className="font-mono text-xs text-blue-600 hover:text-blue-800"
                      >
                        {row.envelope_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">{row.status || '-'}</td>
                    <td className="px-4 py-3 text-xs">{envelopeIndex[row.envelope_id]?.parse_status || '-'}</td>
                    <td className="px-4 py-3 text-xs">{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss')}</td>
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/console/contracts/${encodeURIComponent(row.contract_id)}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Contract
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
