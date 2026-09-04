'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, isAuthenticated } from '@/services/auth'
import { createReceipt } from '@/services/api'
import { TopBar } from '@/components/aws'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default function UploadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [user, setUser] = useState<any>(null)
  const [authorized, setAuthorized] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      setAuthorized(false)
      router.push('/console/login')
      return
    }
    setUser(getCurrentUser())
  }, [router])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)

    try {
      const text = await file.text()
      let data: unknown

      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        data = JSON.parse(text)
      } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        // Simple CSV parsing (in production, use a proper CSV parser)
        const lines = text.split('\n')
        const headers = lines[0].split(',')
        const rows = lines.slice(1).map(line => {
          const values = line.split(',')
          return headers.reduce((obj, header, i) => {
            obj[header.trim()] = values[i]?.trim() || ''
            return obj
          }, {} as Record<string, string>)
        })
        data = { rows }
      } else {
        data = { content: text }
      }

      const receipt = await createReceipt('CSV Upload', data)
      router.push(`/console/ingestion/receipt/${receipt.id}`)
    } catch (error) {
      console.error('Failed to upload file:', error)
      setLoading(false)
    }
  }

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        tenant={user?.tenant}
        serviceName="Ingestion"
        breadcrumbs={['Upload']}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/console/ingestion" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to Ingestion Home
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload File</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
                Select File
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file"
                        name="file"
                        type="file"
                        accept=".csv,.json"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">CSV or JSON up to 10MB</p>
                </div>
              </div>
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: <span className="font-medium">{file.name}</span>
                </p>
              )}
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
                disabled={loading || !file}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
