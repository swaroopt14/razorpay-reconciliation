'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { SchemaDetail, SchemaStatus } from '@/types/validation'

function getStatusBadge(status: SchemaStatus) {
  const styles: Record<SchemaStatus, string> = {
    ACTIVE: 'bg-green-50 text-green-800 border-green-300',
    DEPRECATED: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-300',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  )
}

// Collapsible Section Component
function CollapsibleSection({
  title,
  defaultExpanded = true,
  children,
}: {
  title: string
  defaultExpanded?: boolean
  children: React.ReactNode
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <h2 className="text-sm font-medium text-gray-900">{title}</h2>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && <div className="p-6">{children}</div>}
    </div>
  )
}

export default function SchemaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const schemaName = decodeURIComponent(params?.schema_name as string)
  const version = decodeURIComponent(params?.version as string)

  const [schemaDetail, setSchemaDetail] = useState<SchemaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [jsonExpanded, setJsonExpanded] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (schemaName && version) {
      loadSchemaDetail()
    }
  }, [schemaName, version, router])

  const loadSchemaDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/prod/schema-registry/${encodeURIComponent(schemaName)}/${encodeURIComponent(version)}`
      )
      if (!response.ok) {
        if (response.status === 404) {
          setError('Schema not found')
          return
        }
        setError('Failed to load schema details')
        return
      }
      const data: SchemaDetail = await response.json()
      setSchemaDetail(data)
    } catch (err) {
      console.error('Failed to load schema detail:', err)
      setError('Failed to load schema details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Registry', 'Schema Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading schema details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !schemaDetail) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Registry', 'Schema Detail']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'Schema not found'}</h3>
            <button
              onClick={() => router.push('/console/ingestion/schema-registry')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Schema Registry
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={[
        'Validation & Safety',
        'Schema Registry',
        `${schemaDetail.schema_name} ${schemaDetail.version}`,
      ]}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* ═══════════════════════════════════════════════════════════════════
            SCHEMA HEADER (Identity Block)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-3">
                  <button
                    onClick={() => router.push('/console/ingestion/schema-registry')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Schema
                    </p>
                    <h1 className="text-xl font-semibold text-gray-900">
                      <span className="font-mono">{schemaDetail.schema_name}</span>
                    </h1>
                  </div>
                </div>
                <div className="ml-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Name:</span>{' '}
                    <span className="font-mono text-gray-900">{schemaDetail.schema_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Version:</span>{' '}
                    <span className="font-mono text-gray-900">{schemaDetail.version}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span> {getStatusBadge(schemaDetail.status)}
                  </div>
                  <div>
                    <span className="text-gray-500">Environment:</span>{' '}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                      PRODUCTION
                    </span>
                  </div>
                </div>
              </div>

              {/* Right-side actions (icon-only) */}
              <div className="flex items-center space-x-1 ml-4">
                <button
                  onClick={() => copyToClipboard(schemaDetail.schema_name, 'name')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Copy schema name"
                >
                  {copiedField === 'name' ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(schemaDetail.version, 'version')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Copy version"
                >
                  {copiedField === 'version' ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(schemaDetail.hash, 'hash')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Copy schema hash"
                >
                  {copiedField === 'hash' ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Read-Only Production Banner */}
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Production schema - Read-only.</strong> This page defines what is allowed
                  to enter the financial system. Schemas cannot be edited in production. Changes
                  require CI/CD deployment through staging.
                </p>
              </div>
            </div>
          </div>

          {/* Deprecation Warning */}
          {schemaDetail.status === 'DEPRECATED' && (
            <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Deprecated Schema</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This schema version is deprecated and should not be used for new intents. Migrate
                    to the latest active version.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1: Schema Status & Usage
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Usage">
            <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Used by service
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.used_by_service}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Enforced at stage
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.enforced_at_stage}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Active tenants
                </dt>
                <dd className="text-sm font-semibold text-gray-900">{schemaDetail.active_tenants}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Intents validated
                </dt>
                <dd className="text-sm font-semibold text-green-600">
                  {schemaDetail.intents_validated.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Failures (24h)
                </dt>
                <dd className="text-sm font-semibold text-red-600">{schemaDetail.failures_24h}</dd>
              </div>
            </dl>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 2: Version Metadata (Immutable Facts)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Version Metadata">
            <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Schema format
                </dt>
                <dd className="text-sm text-gray-900">{schemaDetail.schema_format_version}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Canonical version
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.canonical_version}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Schema hash
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.hash}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Created at
                </dt>
                <dd className="text-sm font-mono text-gray-900">
                  {format(new Date(schemaDetail.created_at), 'yyyy-MM-dd HH:mm')} UTC
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Created by
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.created_by}</dd>
              </div>
            </dl>
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Mapped to:</strong>{' '}
                <code className="bg-gray-100 px-1 rounded">payment_intents.schema_version</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">payment_intents.canonical_version</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 3: Canonical Mapping (Critical for Fintech)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Canonical Mapping">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Intent type
                </dt>
                <dd className="text-sm font-semibold text-gray-900">{schemaDetail.intent_type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Maps to table
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.maps_to_table}</dd>
              </div>
            </dl>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Required fields
              </dt>
              <dd className="space-y-1">
                {schemaDetail.required_fields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-mono text-gray-900">{field}</span>
                  </div>
                ))}
              </dd>
            </div>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4: Schema Definition (Read-Only Viewer)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Schema Definition">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">
                Monospace, read-only. No inline edit. No reformat that changes meaning.
              </p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setJsonExpanded(!jsonExpanded)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                >
                  {jsonExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(schemaDetail.schema_content, null, 2), 'schema-json')
                  }
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                >
                  {copiedField === 'schema-json' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded border border-gray-700 overflow-hidden">
              <pre
                className={`text-xs font-mono text-gray-100 p-4 overflow-x-auto ${
                  jsonExpanded ? 'max-h-[500px]' : 'max-h-32'
                } overflow-y-auto`}
              >
                {JSON.stringify(schemaDetail.schema_content, null, 2)}
              </pre>
            </div>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 5: Compatibility & Evolution (Most Important Section)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Compatibility & Evolution">
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Backward compatible
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.compatibility.backward_compatible ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {schemaDetail.compatibility.backward_compatible ? 'YES' : 'NO'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Forward compatible
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.compatibility.forward_compatible ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {schemaDetail.compatibility.forward_compatible ? 'YES' : 'NO'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Breaking changes
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.compatibility.breaking_changes_count > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {schemaDetail.compatibility.breaking_changes_count}
                </dd>
              </div>
            </dl>

            {/* Breaking Change Details */}
            {schemaDetail.compatibility.breaking_changes.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Breaking Change Details
                </h3>
                <div className="space-y-3">
                  {schemaDetail.compatibility.breaking_changes.map((change, index) => (
                    <div
                      key={index}
                      className="bg-red-50 border border-red-200 rounded p-4"
                    >
                      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <dt className="text-xs font-medium text-red-700 mb-1">Field</dt>
                          <dd className="font-mono text-red-900">{change.field}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-red-700 mb-1">Change</dt>
                          <dd className="text-red-900">{change.change_type}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-red-700 mb-1">Impact</dt>
                          <dd className="text-red-900">{change.impact}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 6: Enforcement & Failure Impact
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Enforcement & Failure Impact">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Validation stage
                </dt>
                <dd className="text-sm font-semibold text-gray-900">
                  {schemaDetail.enforcement.validation_stage}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  DLQ stage code
                </dt>
                <dd className="text-sm font-mono text-gray-900">
                  {schemaDetail.enforcement.dlq_stage_code}
                </dd>
              </div>
            </dl>

            <div className="mb-6">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                On failure
              </dt>
              <dd className="space-y-1">
                {schemaDetail.enforcement.on_failure_actions.map(action => (
                  <div key={action} className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm text-gray-900">{action}</span>
                  </div>
                ))}
              </dd>
            </div>

            <div className="pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Mapped to:</strong>{' '}
                <code className="bg-gray-100 px-1 rounded">
                  dlq_items.stage = {schemaDetail.enforcement.dlq_stage_code}
                </code>
                ,{' '}
                <code className="bg-gray-100 px-1 rounded">dlq_items.reason_code</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">
                  ingress_envelopes.parse_status = {schemaDetail.enforcement.envelope_parse_status}
                </code>
              </p>
            </div>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 7: Audit & Evidence (Fintech-Grade)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="Audit & Evidence">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Schema immutable
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.audit.schema_immutable ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {schemaDetail.audit.schema_immutable ? 'YES' : 'NO'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Changes allowed in prod
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.audit.changes_allowed_in_prod ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {schemaDetail.audit.changes_allowed_in_prod ? 'YES' : 'NO'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Evidence stored
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    schemaDetail.audit.evidence_stored ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {schemaDetail.audit.evidence_stored ? 'YES' : 'NO'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Evidence type
                </dt>
                <dd className="text-sm font-mono text-gray-900">{schemaDetail.audit.evidence_type}</dd>
              </div>
            </dl>

            {schemaDetail.audit.evidence_ref && (
              <div className="pt-6 border-t border-gray-200">
                <Link
                  href={`/console/ingestion/evidence?ref=${encodeURIComponent(schemaDetail.audit.evidence_ref)}`}
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                  View schema evidence receipt
                </Link>
              </div>
            )}
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 8: What This Page Does NOT Do (Explicit)
              ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-gray-50 border border-gray-200 rounded p-6 mb-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              What this page explicitly does NOT do
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No editing in production</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No schema publishing</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No test payload execution</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No tenant overrides</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Those actions belong to CI/CD pipelines and staging environments, not the production
              console.
            </p>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 9: System Mapping (Direct)
              ═══════════════════════════════════════════════════════════════════ */}
          <CollapsibleSection title="System Mapping">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Layer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">UI page</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">
                      /console/ingestion/schema-registry/*
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Service</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">
                      zord-intent-engine
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Enforcement</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">
                      Pre-ACC Guard
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Tables</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">
                      payment_intents, dlq_items
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Evidence</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">
                      intent_worm_ref
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          {/* Final Lock Statement */}
          <div className="bg-gray-900 text-white rounded p-6 text-center">
            <p className="text-sm font-medium">
              This page defines the law of ingestion.
              <br />
              <span className="text-gray-400">Everything else obeys it.</span>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
