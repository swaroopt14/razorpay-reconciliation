'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { 
  HashVerifierResponse, 
  VerificationResult,
  VerificationMode,
  ChainRecord
} from '@/types/hash-verifier'

// AWS-style status badge
function StatusBadge({ status }: { status: 'VERIFIED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' }) {
  const styles = {
    VERIFIED: 'bg-green-100 text-green-800 border-green-200',
    FAILED: 'bg-red-100 text-red-800 border-red-200',
    PENDING: 'bg-gray-100 text-gray-800 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  )
}

// Record status indicator
function RecordStatus({ status }: { status: ChainRecord['status'] }) {
  const config = {
    STORED_EQUALS_COMPUTED: { label: 'STORED=COMP', color: 'text-green-600', icon: '✓' },
    CHAIN_HEAD: { label: 'CHAIN HEAD', color: 'text-blue-600', icon: '◆' },
    MISMATCH: { label: 'MISMATCH', color: 'text-red-600', icon: '✗' },
    MISSING: { label: 'MISSING', color: 'text-yellow-600', icon: '!' },
  }
  const { label, color, icon } = config[status]
  return (
    <span className={`font-mono text-xs ${color}`}>
      {icon} {label}
    </span>
  )
}

// Hash display component (monospace, truncated)
function HashDisplay({ hash, full }: { hash: string; full?: boolean }) {
  const displayHash = full ? hash : `${hash.substring(0, 8)}…${hash.substring(hash.length - 4)}`
  return (
    <span 
      className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-gray-200" 
      title={hash}
      onClick={() => navigator.clipboard.writeText(hash)}
    >
      {displayHash}
    </span>
  )
}

export default function HashChainVerifierPage() {
  const router = useRouter()
  const [pageData, setPageData] = useState<HashVerifierResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Verification form state
  const [mode, setMode] = useState<VerificationMode>('RANGE')
  const [startId, setStartId] = useState('')
  const [endId, setEndId] = useState('')
  const [singleId, setSingleId] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    loadPageData()
  }, [router])

  const loadPageData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/prod/hash-verifier')
      if (!response.ok) {
        setError('Failed to load hash verifier data')
        return
      }
      const data: HashVerifierResponse = await response.json()
      setPageData(data)
    } catch (err) {
      console.error('Failed to load hash verifier:', err)
      setError('Failed to load hash verifier data')
    } finally {
      setLoading(false)
    }
  }

  const runVerification = async () => {
    setVerifying(true)
    setResult(null)
    
    try {
      const body: Record<string, string> = { mode }
      
      if (mode === 'RANGE') {
        body.start_id = startId
        body.end_id = endId
      } else if (mode === 'ENVELOPE_ID') {
        body.envelope_id = singleId
      } else if (mode === 'INTENT_ID') {
        body.intent_id = singleId
      }

      const response = await fetch('/api/prod/hash-verifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error('Verification failed')
      }

      const verificationResult: VerificationResult = await response.json()
      setResult(verificationResult)
    } catch (err) {
      console.error('Verification error:', err)
      setError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const exportPDF = () => {
    alert('PDF Report generation would be triggered here.\nThis creates a signed, court-admissible verification report with verifier identity and timestamp.')
  }

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
  }

  const user = getCurrentUser()

  if (loading && !pageData) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Hash Chain Verifier']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading hash verifier...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error && !pageData) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Hash Chain Verifier']} tenant={user?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button onClick={loadPageData} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Retry
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Evidence Plane', 'Hash Chain Verifier']} tenant={user?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Hash Chain Verifier</h1>
            <p className="mt-1 text-sm text-gray-500">Cryptographic proof of evidence immutability</p>
          </div>
          <div className="flex items-center space-x-3">
            <Link 
              href="/console/ingestion/evidence/integrity" 
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              ← Evidence Integrity
            </Link>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Verification Mode */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Verification Mode</h2>
            </div>
            <div className="p-6">
              {/* Mode Selection */}
              <div className="space-y-3 mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'RANGE'}
                    onChange={() => setMode('RANGE')}
                    className="h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Evidence Range</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'ENVELOPE_ID'}
                    onChange={() => setMode('ENVELOPE_ID')}
                    className="h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Envelope ID</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'INTENT_ID'}
                    onChange={() => setMode('INTENT_ID')}
                    className="h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Intent ID</span>
                </label>
              </div>

              {/* Input Fields */}
              {mode === 'RANGE' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Start ID</label>
                    <input
                      type="text"
                      value={startId}
                      onChange={(e) => setStartId(e.target.value)}
                      placeholder="env_20260113T120000Z_0001"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">End ID</label>
                    <input
                      type="text"
                      value={endId}
                      onChange={(e) => setEndId(e.target.value)}
                      placeholder="env_20260113T123000Z_0129"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    {mode === 'ENVELOPE_ID' ? 'Envelope ID' : 'Intent ID'}
                  </label>
                  <input
                    type="text"
                    value={singleId}
                    onChange={(e) => setSingleId(e.target.value)}
                    placeholder={mode === 'ENVELOPE_ID' ? 'env_20260113T122911Z_twyh' : 'pi_20260115_91XK'}
                    className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Algorithm Display */}
              <div className="mt-6 p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 uppercase">Algorithm</span>
                  <span className="text-sm font-mono font-medium text-gray-900">SHA-256</span>
                </div>
              </div>

              {/* Verify Button */}
              <button
                onClick={runVerification}
                disabled={verifying || (mode === 'RANGE' ? !startId || !endId : !singleId)}
                className={`mt-6 w-full px-4 py-3 text-sm font-medium rounded ${
                  verifying || (mode === 'RANGE' ? !startId || !endId : !singleId)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {verifying ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Verifying...
                  </span>
                ) : (
                  'VERIFY'
                )}
              </button>
            </div>
          </div>

          {/* Verification Result */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Verification Result</h2>
            </div>
            <div className="p-6">
              {result ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded border ${
                    result.status === 'VERIFIED' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <span className={`text-2xl ${result.status === 'VERIFIED' ? 'text-green-600' : 'text-red-600'}`}>
                        {result.status === 'VERIFIED' ? '✓' : '✗'}
                      </span>
                      <div>
                        <div className={`text-lg font-semibold ${
                          result.status === 'VERIFIED' ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {result.status}
                        </div>
                        <div className={`text-sm ${
                          result.status === 'VERIFIED' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Cryptographic proof {result.status === 'VERIFIED' ? 'confirmed' : 'failed'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Result Details */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Records</span>
                      <span className="text-sm font-medium text-gray-900">
                        {result.verified_records}/{result.total_records}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Chain Breaks</span>
                      <span className={`text-sm font-medium ${
                        result.chain_breaks === 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {result.chain_breaks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Time</span>
                      <span className="text-sm font-medium text-gray-900">{result.verification_time_ms}ms</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Verification ID</span>
                      <span className="text-sm font-mono text-gray-900">{result.verification_id}</span>
                    </div>
                  </div>

                  {/* Audit Output */}
                  <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-3">Audit Output</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Performed by:</span>
                        <span className="font-medium text-gray-900">{result.performed_by}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Performed at:</span>
                        <span className="font-medium text-gray-900">
                          {format(new Date(result.completed_at), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex space-x-3">
                      <button
                        onClick={exportPDF}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                      >
                        PDF Report
                      </button>
                      <button
                        onClick={() => copyHash(result.chain_head_hash)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Copy Head Hash
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-sm">Enter evidence IDs and click VERIFY to run cryptographic verification</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hash Chain Walkthrough (if result exists) */}
        {result && result.records.length > 0 && (
          <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-900">Hash Chain Walkthrough</h2>
              <span className="text-xs text-gray-500">{result.records.length} records shown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evidence ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stored Hash</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prev Hash</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {result.records.map((record) => (
                    <tr key={record.sequence} className={`hover:bg-gray-50 ${
                      record.status === 'CHAIN_HEAD' ? 'bg-blue-50' : 
                      record.status === 'MISMATCH' ? 'bg-red-50' : ''
                    }`}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {record.sequence}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">
                          {record.evidence_id.length > 24 
                            ? `${record.evidence_id.substring(0, 12)}…${record.evidence_id.substring(record.evidence_id.length - 8)}`
                            : record.evidence_id
                          }
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <HashDisplay hash={record.stored_hash} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <HashDisplay hash={record.previous_hash} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RecordStatus status={record.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chain Stats + Recent Verifications */}
        {pageData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chain Stats */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Chain Statistics</h2>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Records</span>
                  <span className="text-sm font-medium text-gray-900">{pageData.chain_stats.total_records.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Algorithm</span>
                  <span className="text-sm font-mono font-medium text-gray-900">{pageData.chain_stats.algorithm}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Oldest Record</span>
                  <span className="text-sm text-gray-900">{format(new Date(pageData.chain_stats.oldest_record), 'yyyy-MM-dd')}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Newest Record</span>
                  <span className="text-sm text-gray-900">{format(new Date(pageData.chain_stats.newest_record), 'yyyy-MM-dd HH:mm')}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Chain Head</div>
                  <div className="font-mono text-xs text-gray-600 bg-gray-50 p-2 rounded break-all">
                    {pageData.chain_head.hash}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Sequence #{pageData.chain_head.sequence} • {pageData.chain_head.evidence_id}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Verifications */}
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Recent Verifications</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {pageData.recent_verifications.map((v) => (
                  <div key={v.verification_id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-gray-900">{v.verification_id}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{v.records_verified} records • {v.duration_ms}ms</span>
                      <span>{format(new Date(v.timestamp), 'MMM d, HH:mm')}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      by {v.performed_by}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
