'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { fetchContracts } from '@/services/backend/contracts'
import { ContractInstance } from '@/types/contract-instance'
export default function ContractsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState<ContractInstance[]>([])
  const [error, setError] = useState<string | null>(null)
  

  const loadContracts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchContracts()
      setContracts(data.contracts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }

    
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

    loadContracts()
  }, [router])
 

 

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RoleSwitcher />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Contracts ▸ Payout Contracts</h1>
        <p className="mt-2 text-sm text-gray-600">
          Read-only view of contracts derived from intents. Immutable artifacts.
        </p>
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
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Time</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Status ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Type ▾</select>
        <button
          onClick={loadContracts}
          className="ml-auto px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>  
          <tbody className="bg-white divide-y divide-gray-200">
            {contracts.map((c) => (
              <tr key={c.contract_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{c.contract_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{c.intent_id}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    c.status === 'ISSUED' ? 'bg-green-100 text-green-800' : 
                    c.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                    c.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                    c.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    c.status === 'PROCESSING' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {c.created_at ? format(new Date(c.created_at), 'yyyy-MM-dd HH:mm:ss') : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/contracts/${c.contract_id}`} className="text-blue-600 hover:text-blue-800">View →</Link>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                  No contracts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">
          Showing {contracts.length} contracts
        </div>
      </div>
    </div>
  )
}
