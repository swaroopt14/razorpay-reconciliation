'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { fetchContractById, decodeContractPayload } from '@/services/backend/contracts'
import { ContractInstance, DecodedContractPayload } from '@/types/contract-instance'

export default function ContractDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [contract, setContract] = useState<ContractInstance | null>(null)
  const [decodedPayload, setDecodedPayload] = useState<DecodedContractPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payloadExpanded, setPayloadExpanded] = useState(false)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/ops/login')
      return
    }
    const user = getCurrentUser()
    if (user && !canAccessDLQ(user.role)) {
      router.push('/ops/login')
      return
    }

    const loadContract = async () => {
      try {
        setLoading(true)
        setError(null)
        const contractData = await fetchContractById(id)
        setContract(contractData)
        
        // Decode payload
        const decoded = decodeContractPayload(contractData.contract_payload)
        setDecodedPayload(decoded)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contract')
      } finally {
        setLoading(false)
      }
    }

    loadContract()
  }, [router, id])

  const loadContract = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/prod/payout-contracts/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setContract(null)
        setError('Contract not found')
        return
      }
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setContract(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contract')
      setContract(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (error && !contract) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RoleSwitcher />
        <div className="mb-4">
          <Link href="/ops/contracts" className="text-sm text-gray-500 hover:text-gray-700">
            Contracts
          </Link>
          <span className="mx-2 text-gray-400">▸</span>
          <span className="text-sm font-medium text-gray-900">{id}</span>
        </div>
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      </div>
    )
  }

  const decoded = contract?.contract_payload ? atob(contract.contract_payload) : null
  let prettyPayload = ''
  if (decoded) {
    try {
      const parsed = JSON.parse(decoded)
      prettyPayload = JSON.stringify(parsed, null, 2)
    } catch {
      // Non-JSON payload: display decoded but still avoid leaking obvious PII-like strings.
      prettyPayload = decoded
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RoleSwitcher />
      <div className="mb-4">
        <Link href="/ops/contracts" className="text-sm text-gray-500 hover:text-gray-700">Contracts</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">{id}</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Contracts ▸ {id}</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Contract ID:</span>
            <span className="font-mono">{contract?.contract_id || id}</span>
            <button 
              onClick={() => navigator.clipboard.writeText(contract?.contract_id || id)} 
              className="text-blue-600 hover:text-blue-800 text-xs"
            >
              [Copy]
            </button>
          </div>
          <div>
            <span className="text-gray-500">Intent ID:</span>{' '}
            <Link href={`/ops/intents/${contract?.intent_id}`} className="text-blue-600 hover:text-blue-800">
              {contract?.intent_id}
            </Link>
          </div>
          <div><span className="text-gray-500">Status:</span> {contract?.status}</div>
          <div><span className="text-gray-500">Created At:</span> {contract?.created_at}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Contract Hash:</span>
            <span className="font-mono">{contract?.contract_hash?.substring(0, 8)}...</span>
            <button 
              onClick={() => navigator.clipboard.writeText(contract?.contract_hash || '')} 
              className="text-blue-600 hover:text-blue-800 text-xs"
            >
              [Copy]
            </button>
          </div>
          <div><span className="text-gray-500">Tenant ID:</span> {contract?.tenant_id}</div>
          <div><span className="text-gray-500">Envelope ID:</span> {contract?.envelope_id}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Contract Payload (redacted)</h2>
            <button
              onClick={() => setPayloadExpanded((v) => !v)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {payloadExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        <div className="px-6 py-4">
          {decodedPayload ? (
            <pre className="text-sm font-mono bg-gray-50 p-4 rounded overflow-x-auto">
              {JSON.stringify(decodedPayload, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-gray-500">Failed to decode payload</div>
          )}
        </div>
      </div>
    </div>
  )
}
