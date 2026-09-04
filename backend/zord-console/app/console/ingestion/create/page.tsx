'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, isAuthenticated } from '@/services/auth'
import { createReceipt } from '@/services/api'
import { TopBar } from '@/components/aws'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default function CreateIntentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authorized, setAuthorized] = useState(true)
  const [formData, setFormData] = useState({
    customer_id: '',
    order_id: '',
    amount: '',
    description: '',
  })

  useEffect(() => {
    if (!isAuthenticated()) {
      setAuthorized(false)
      router.push('/console/login')
      return
    }
    setUser(getCurrentUser())
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        customer_id: formData.customer_id,
        order_id: formData.order_id,
        amount: parseFloat(formData.amount),
        description: formData.description,
      }

      const receipt = await createReceipt('API', payload)
      router.push(`/console/ingestion/receipt/${receipt.id}`)
    } catch (error) {
      console.error('Failed to create receipt:', error)
      setLoading(false)
    }
  }

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar tenant={user?.tenant} serviceName="Ingestion" breadcrumbs={['Create Intent']} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/console/ingestion" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to Ingestion Home
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Intent</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700">
                Customer ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="customer_id"
                required
                value={formData.customer_id}
                onChange={e => setFormData({ ...formData, customer_id: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="cust_123"
              />
            </div>

            <div>
              <label htmlFor="order_id" className="block text-sm font-medium text-gray-700">
                Order ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="order_id"
                required
                value={formData.order_id}
                onChange={e => setFormData({ ...formData, order_id: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="ord_456"
              />
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="amount"
                required
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="99.99"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center justify-end space-x-4">
              <Link
                href="/console/ingestion"
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Intent'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
