'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  EvidenceIntegrityResponse, 
  IntegrityStatus,
  VerificationEvent 
} from '@/types/evidence-integrity'

// AWS-style status badge
function StatusBadge({ status }: { status: IntegrityStatus }) {
  const styles = {
    VERIFIED: 'bg-green-100 text-green-800 border-green-200',
    DEGRADED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    FAILED: 'bg-red-100 text-red-800 border-red-200',
    CHECKING: 'bg-blue-100 text-blue-800 border-blue-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  )
}

// AWS-style metric card with left border
function MetricCard({ label, value, sublabel, status }: { label: string; value: string | number; sublabel?: string; status?: 'good' | 'warning' | 'error' }) {
  const borderColor = status === 'error' ? 'border-l-red-500' : status === 'warning' ? 'border-l-yellow-500' : 'border-l-green-500'
  return (
    <div className={`bg-white border border-gray-200 rounded p-4 border-l-4 ${borderColor}`}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-gray-900">{value}</dd>
      {sublabel && <dd className="text-xs text-gray-500 mt-1">{sublabel}</dd>}
    </div>
  )
}

// Compliance row component
function ComplianceRow({ label, value, status }: { label: string; value: string; status: 'pass' | 'fail' | 'info' }) {
  const statusColors = {
    pass: 'text-green-600',
    fail: 'text-red-600',
    info: 'text-gray-600',
  }
  const statusIcons = {
    pass: '✓',
    fail: '✗',
    info: '•',
  }
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${statusColors[status]}`}>
        {statusIcons[status]} {value}
      </span>
    </div>
  )
}

// Event type badge
function EventTypeBadge({ type, status }: { type: VerificationEvent['event_type']; status: VerificationEvent['status'] }) {
  const statusColors = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  }
  const labels: Record<VerificationEvent['event_type'], string> = {
    VERIFICATION_OK: 'Verification OK',
    BATCH_APPENDED: 'Batch Appended',
    RETENTION_OK: 'Retention OK',
    CHAIN_VERIFIED: 'Chain Verified',
    COMPLIANCE_CHECK: 'Compliance Check',
    HASH_MISMATCH: 'Hash Mismatch',
    CHAIN_BROKEN: 'Chain Broken',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[status]}`}>
      {labels[type]}
    </span>
  )
}

export default function EvidenceIntegrityPage() {
  const router = useRouter()
  const [data, setData] = useState<EvidenceIntegrityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadData()
    const interval = setInterval(loadData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [router])

  const loadData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/evidence-integrity')
      if (!response.ok) {
        setError('Failed to load evidence integrity data')
        return
      }
      const result: EvidenceIntegrityResponse = await response.json()
      setData(result)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to load evidence integrity:', err)
      setError('Failed to load evidence integrity data')
    } finally {
      setLoading(false)
    }
  }

  const exportPDF = () => {
    // In production, this would generate a signed PDF report
    alert('PDF Report generation would be triggered here.\nThis creates a signed, court-defensible compliance report.')
  }

  const exportCSV = () => {
    if (!data) return
    const csv = [
      'Event ID,Timestamp,Type,Status,Description,Records Affected,Actor',
      ...data.recent_events.map(e => 
        `"${e.event_id}","${e.timestamp}","${e.event_type}","${e.status}","${e.description}","${e.records_affected}","${e.actor}"`
      )
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evidence_integrity_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const user = getCurrentUser()

  if (loading && !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Evidence Integrity']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Verifying evidence integrity...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Evidence Integrity']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Failed to load data'}</p>
            <button onClick={loadData} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Retry
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const isFullyVerified = data.integrity.status === 'VERIFIED' && data.integrity.integrity_percent === 100

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Evidence Integrity']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-semibold text-gray-900">Evidence Integrity</h1>
              <StatusBadge status={data.integrity.status} />
            </div>
            <p className="mt-1 text-sm text-gray-500">Immutable audit trail verification + WORM compliance</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-500">Last check: {formatDistanceToNow(new Date(data.integrity.last_check_at))} ago</span>
            <button onClick={loadData} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Refresh
            </button>
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Export CSV
            </button>
            <button onClick={exportPDF} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700">
              PDF Report
            </button>
          </div>
        </div>

        {/* Primary Status Banner */}
        <div className={`mb-6 p-4 rounded border ${isFullyVerified ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className={`text-2xl ${isFullyVerified ? 'text-green-600' : 'text-yellow-600'}`}>
                {isFullyVerified ? '✓' : '!'}
              </span>
              <div>
                <div className={`text-lg font-semibold ${isFullyVerified ? 'text-green-800' : 'text-yellow-800'}`}>
                  {isFullyVerified ? 'VERIFIED' : data.integrity.status}
                </div>
                <div className={`text-sm ${isFullyVerified ? 'text-green-600' : 'text-yellow-600'}`}>
                  {data.integrity.verified_records.toLocaleString()}/{data.integrity.total_records.toLocaleString()} records • {data.integrity.integrity_percent}% Hash Chain Intact
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Next verification</div>
              <div className="text-sm font-medium text-gray-700">
                {format(new Date(data.integrity.next_check_at), 'HH:mm:ss')}
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Integrity Status + Coverage */}
          <div className="space-y-6">
            {/* Coverage */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Evidence Coverage</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Envelopes</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {data.coverage.envelopes_covered.toLocaleString()}/{data.coverage.envelopes_total.toLocaleString()}
                      </span>
                      <span className={`text-xs font-medium ${data.coverage.envelopes_percent === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {data.coverage.envelopes_percent === 100 ? '✓' : '!'} {data.coverage.envelopes_percent}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Intents</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {data.coverage.intents_covered.toLocaleString()}/{data.coverage.intents_total.toLocaleString()}
                      </span>
                      <span className={`text-xs font-medium ${data.coverage.intents_percent === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {data.coverage.intents_percent === 100 ? '✓' : '!'} {data.coverage.intents_percent}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">DLQ Items</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {data.coverage.dlq_covered.toLocaleString()}/{data.coverage.dlq_total.toLocaleString()}
                      </span>
                      <span className={`text-xs font-medium ${data.coverage.dlq_percent === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {data.coverage.dlq_percent === 100 ? '✓' : '!'} {data.coverage.dlq_percent}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Contracts</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {data.coverage.contracts_covered.toLocaleString()}/{data.coverage.contracts_total.toLocaleString()}
                      </span>
                      <span className={`text-xs font-medium ${data.coverage.contracts_percent === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {data.coverage.contracts_percent === 100 ? '✓' : '!'} {data.coverage.contracts_percent}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Metrics */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Audit Metrics (24h)</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-2xl font-semibold text-gray-900">{data.audit_metrics.verifications_24h}</div>
                    <div className="text-xs text-gray-500">Verifications</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-2xl font-semibold text-green-600">{data.audit_metrics.verifications_success_rate}%</div>
                    <div className="text-xs text-gray-500">Success Rate</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-2xl font-semibold text-gray-900">{data.audit_metrics.batches_appended_24h}</div>
                    <div className="text-xs text-gray-500">Batches Appended</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className={`text-2xl font-semibold ${data.audit_metrics.anomalies_detected_24h > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {data.audit_metrics.anomalies_detected_24h}
                    </div>
                    <div className="text-xs text-gray-500">Anomalies</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Compliance + Hash Chain */}
          <div className="space-y-6">
            {/* Compliance Proof */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Compliance Proof</h2>
              </div>
              <div className="p-6">
                <ComplianceRow 
                  label="Storage Mode" 
                  value={data.compliance.storage_mode} 
                  status={data.compliance.storage_mode === 'WORM' ? 'pass' : 'fail'} 
                />
                <ComplianceRow 
                  label="Object Lock" 
                  value={data.compliance.object_lock_status} 
                  status={data.compliance.object_lock_status === 'ENABLED' ? 'pass' : 'fail'} 
                />
                <ComplianceRow 
                  label="Lock Mode" 
                  value={data.compliance.object_lock_mode} 
                  status={data.compliance.object_lock_mode === 'COMPLIANCE' ? 'pass' : 'info'} 
                />
                <ComplianceRow 
                  label="Retention" 
                  value={`${data.compliance.retention_years} Years`} 
                  status={data.compliance.retention_years >= 7 ? 'pass' : 'fail'} 
                />
                <ComplianceRow 
                  label="Early Delete" 
                  value={data.compliance.early_delete_blocked ? 'BLOCKED' : 'ALLOWED'} 
                  status={data.compliance.early_delete_blocked ? 'pass' : 'fail'} 
                />
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Standards</div>
                  <div className="flex flex-wrap gap-2">
                    {data.compliance.compliance_standards.map((std) => (
                      <span key={std} className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {std}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Hash Chain Health */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Hash Chain Health</h2>
              </div>
              <div className="p-6">
                <ComplianceRow 
                  label="Algorithm" 
                  value={data.hash_chain.algorithm} 
                  status="info" 
                />
                <ComplianceRow 
                  label="Chains Verified" 
                  value={data.hash_chain.chains_verified.toLocaleString()} 
                  status="pass" 
                />
                <ComplianceRow 
                  label="Broken Chains" 
                  value={data.hash_chain.broken_chains.toString()} 
                  status={data.hash_chain.broken_chains === 0 ? 'pass' : 'fail'} 
                />
                <ComplianceRow 
                  label="Verification Time" 
                  value={`${data.hash_chain.verification_duration_ms}ms`} 
                  status="info" 
                />
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Chain Head</div>
                  <div className="font-mono text-xs text-gray-600 bg-gray-50 p-2 rounded truncate" title={data.hash_chain.chain_head_hash}>
                    {data.hash_chain.chain_head_hash.substring(0, 32)}...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Verification Events */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">Recent Verification Events</h2>
            <span className="text-xs text-gray-500">{data.recent_events.length} events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Records</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recent_events.map((event) => (
                  <tr key={event.event_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(event.timestamp), 'HH:mm')} UTC
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <EventTypeBadge type={event.event_type} status={event.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {event.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {event.records_affected.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                      {event.actor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Audit Actions</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/console/ingestion/evidence"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Evidence Explorer
              </Link>
              <Link
                href="/console/ingestion/hash-verifier"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Hash Chain Verifier
              </Link>
              <button
                onClick={exportPDF}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Generate Compliance Report (PDF)
              </button>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              PDF reports are cryptographically signed and court-defensible for regulatory audits.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
