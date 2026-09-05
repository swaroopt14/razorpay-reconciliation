'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { type OverviewData } from '@/services/api'

interface ResourceCounts {
  intents: { total: number; running: number; pending: number }
  raw_envelopes: number
  batches: number
  batch_pipelines: number
  stream_consumers: number
  consumer_groups: number
  evidence_receipts: number
  schema_versions: number
  idempotency_keys: number
  api_gateways: number
  webhook_receivers: number
}

export default function IngestionServiceHomePage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [resources, setResources] = useState<ResourceCounts | null>(null)
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const user = getCurrentUser()

  const loadResources = useCallback(async () => {
    try {
      const response = await fetch('/api/prod/ingestion/resources')
      if (!response.ok) {
        throw new Error('Failed to fetch resources')
      }
      const data: ResourceCounts = await response.json()
      setResources(data)
    } catch (err) {
      console.error('Failed to load resources:', err)
      setError('Failed to load resources')
    }
  }, [])

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch('/api/prod/overview')
      if (!response.ok) {
        throw new Error('Failed to fetch overview')
      }
      const data: OverviewData = await response.json()
      setOverviewData(data)
    } catch (err) {
      console.error('Failed to load overview:', err)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    setMounted(true)
    Promise.all([loadResources(), loadOverview()]).finally(() => {
      setLoading(false)
    })

    // Save to recently used
    if (typeof window !== 'undefined') {
      const recent = JSON.parse(localStorage.getItem('zord-recently-used') || '[]')
      const updated = ['ingestion', ...recent.filter((id: string) => id !== 'ingestion')].slice(0, 6)
      localStorage.setItem('zord-recently-used', JSON.stringify(updated))
    }
  }, [router, loadResources, loadOverview])

  if (!mounted) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={[]} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={[]} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-normal text-gray-900">Ingestion</h1>
            <p className="text-sm text-gray-500 mt-1">Accept, normalize, and persist financial intents</p>
          </div>
        </div>

        {/* Top Row: Resources and Account Attributes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Resources Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Resources</h2>
              <div className="flex items-center space-x-1">
                <Link
                  href="/console/ingestion"
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Ingestion Global view"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </Link>
                <button
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Refresh"
                  onClick={() => {
                    loadResources()
                    loadOverview()
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                <button
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Settings"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-5">
                You are using the following Ingestion resources in the <strong className="font-semibold text-gray-900">Asia Pacific (Mumbai)</strong> Region:
              </p>
              {loading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-600"></div>
                </div>
              ) : resources ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/intents"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Intents (canonicalized)
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.intents.running.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/intents"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Intents (rejected)
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.intents.pending.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/intents"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Intents
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.intents.total.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/raw-envelopes"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Raw Envelopes
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.raw_envelopes.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/batch-pipelines"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Batch Pipelines
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.batch_pipelines.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/batch-pipelines"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Batches
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.batches.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/stream-consumers"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Stream Consumers
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.stream_consumers.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/stream-consumers"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Consumer Groups
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.consumer_groups.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/evidence"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Evidence Receipts
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.evidence_receipts.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/schema"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Schema Versions
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.schema_versions.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/idempotency"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Idempotency Keys
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.idempotency_keys.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href="/console/ingestion/integrations/api"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      API Gateways
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">{resources.api_gateways.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Unable to load resources</p>
                  {error && (
                    <button
                      onClick={loadResources}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Account Attributes Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Account attributes</h2>
              <button
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Refresh"
                onClick={() => {
                  loadOverview()
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-5">
                <div>
                  <Link
                    href="/console/ingestion/schema"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 mb-2"
                  >
                    <span>Supported schemas</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </Link>
                  <ul className="ml-4 space-y-1.5">
                    <li className="text-sm text-gray-700">• JSON Schema v7</li>
                    <li className="text-sm text-gray-700">• Avro Schema</li>
                    <li className="text-sm text-gray-700">• Protobuf</li>
                  </ul>
                </div>
                <div>
                  <Link
                    href="/console/ingestion"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 mb-2"
                  >
                    <span>Default Environment</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </Link>
                  <div className="ml-4">
                    <span className="text-sm font-mono font-semibold text-gray-900">PRODUCTION</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Settings</div>
                  <div className="space-y-2.5">
                    <Link
                      href="/console/ingestion/governance/retention"
                      className="block text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Retention Policies
                    </Link>
                    <Link
                      href="/console/ingestion/schema"
                      className="block text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Schema Registry
                    </Link>
                    <Link
                      href="/console/ingestion/operations/health"
                      className="block text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Health Monitoring
                    </Link>
                    <Link
                      href="/console/ingestion/governance/access"
                      className="block text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Access Control
                    </Link>
                    <Link
                      href="/console/ingestion/operations/errors"
                      className="block text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      Error Handling
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Banner */}
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg p-4 flex items-start justify-between hover:bg-blue-100 transition-colors">
          <div className="flex items-start flex-1">
            <svg className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-blue-900 leading-relaxed">
                Easily ingest, normalize, and persist financial intents using Zord&apos;s unified ingestion platform. Ensure
                regulatory compliance with built-in evidence plane and audit trails.{' '}
                <Link href="/console/ingestion" className="font-semibold underline hover:text-blue-950">
                  Learn more
                </Link>
              </p>
            </div>
          </div>
          <button className="text-blue-500 hover:text-blue-700 ml-4 flex-shrink-0 p-1 rounded hover:bg-blue-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Bottom Row: Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Intent Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-2.5">Create Intent</h2>
              <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                To get started, create a financial intent using the API, webhook, or batch upload.
              </p>
              <Link
                href="/console/ingestion/create"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-md hover:bg-orange-700 transition-colors shadow-sm"
              >
                Create Intent
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Service Health Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Service health</h2>
              <Link
                href="/console/ingestion/operations/health"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm mb-4"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Ingestion Health Dashboard
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </Link>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Region</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">Asia Pacific (Mumbai)</div>
              </div>
            </div>
          </div>

          {/* Explore Zord Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Explore Zord</h2>
                <button className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Zord Evidence Plane</h3>
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    Zord now provides immutable evidence storage with WORM compliance and hash chain integrity for
                    regulatory proof.
                  </p>
                  <Link
                    href="/console/ingestion/evidence"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5"
                  >
                    <span>Learn more</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </Link>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Save up to 90% on processing costs with batch ingestion pipelines.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
