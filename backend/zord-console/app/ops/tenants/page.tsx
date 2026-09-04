'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { format } from 'date-fns'

export default function OpsTenantsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [tenants, setTenants] = useState<any[]>([])

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
    loadTenants()
  }, [router])

  const loadTenants = async () => {
    try {
      const res = await fetch('/api/prod/tenants')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setTenants(data.items || [])
    } catch (err) {
      console.error('Failed to load tenants:', err)
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RoleSwitcher />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
        <p className="mt-2 text-sm text-gray-600">
          Read-only view of tenants. Confirm status, rotate keys via deep link, and jump into tenant activity.
        </p>
      </div>

      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="Search tenant name / ID"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">All Status</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tenants.map((t: any) => (
              <tr key={t.tenant_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{t.tenant_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.tenant_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${t.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <Link href={`/ops/intents?tenant=${t.tenant_id}`} className="text-blue-600 hover:text-blue-800">
                    View activity →
                  </Link>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">No tenants found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">
          Showing {tenants.length} tenants
        </div>
      </div>
    </div>
  )
}
