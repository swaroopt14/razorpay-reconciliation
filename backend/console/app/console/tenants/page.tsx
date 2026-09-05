'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated } from '@/services/auth'
import { Layout } from '@/components/aws/Layout'
import { format } from 'date-fns'

interface Tenant {
  tenant_id: string
  tenant_name: string
  status: string
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'} mr-1.5`} />
      {status}
    </span>
  )
}

function TenantDirectoryContent() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadTenants = async () => {
    try {
      setError(null)
      setLoading(true)
      const res = await fetch('/api/prod/tenants')
      if (!res.ok) throw new Error(`Failed to fetch tenants: ${res.status}`)
      const data = await res.json()
      setTenants(data.items || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadTenants()
  }, [router])

  const filteredTenants = tenants.filter(t => {
    return t.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      t.tenant_id.toLowerCase().includes(search.toLowerCase())
  })

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'ACTIVE').length,
    inactive: tenants.filter(t => t.status !== 'ACTIVE').length,
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600" />
            <p className="mt-3 text-sm text-gray-500">Loading tenants...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white border border-red-200 rounded p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={loadTenants} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="zord-page">
      {/* Header */}
      <div className="zord-page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="zord-page-title text-xl">Tenant Directory</h1>
            <p className="zord-page-subtitle">Real-time overview of all registered tenants</p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={loadTenants} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
            <input
              type="text"
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="zord-input w-64"
            />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-left">
            <div className="text-sm text-gray-500">Total Tenants</div>
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-left">
            <div className="text-sm text-gray-500">Active</div>
            <div className="text-3xl font-bold text-green-600">{stats.active}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-left">
            <div className="text-sm text-gray-500">Inactive</div>
            <div className="text-3xl font-bold text-red-600">{stats.inactive}</div>
          </div>
        </div>

        {/* Tenant Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tenant Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Tenant ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Created At</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTenants.map((tenant) => (
                <tr 
                  key={tenant.tenant_id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/console/tenants/${tenant.tenant_id}`)}
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{tenant.tenant_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 font-mono">{tenant.tenant_id}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {format(new Date(tenant.created_at), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link 
                      href={`/console/tenants/${tenant.tenant_id}`}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTenants.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No tenants found matching your criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TenantDirectoryPage() {
  return (
    <Layout serviceName="Ops Ingestion" breadcrumbs={['Tenants', 'Directory']}>
      <TenantDirectoryContent />
    </Layout>
  )
}
