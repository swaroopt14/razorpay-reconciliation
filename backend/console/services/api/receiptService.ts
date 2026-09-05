import { Receipt } from '@/types/receipt'
import { Batch } from '@/types/batch'
import { EvidenceTree, EvidenceFile } from '@/types/evidence'

// Mock API - simulates backend responses
const MOCK_DELAY = 500

function delay(ms: number = MOCK_DELAY): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Mock data storage
const mockReceipts: Map<string, Receipt> = new Map()
const mockBatches: Map<string, Batch> = new Map()
const mockEvidence: Map<string, EvidenceTree> = new Map()
const mockFiles: Map<string, EvidenceFile> = new Map()

// Initialize some mock data
function initializeMockData() {
  const receipt1: Receipt = {
    id: 'rec_001',
    receiptId: 'env_20260110_abc123',
    source: 'API',
    tenant: 'acme-corp',
    receivedAt: new Date('2026-01-10T09:45:12Z').toISOString(),
    status: 'CANONICALIZED',
    evidenceExists: true,
  }

  const receipt2: Receipt = {
    id: 'rec_002',
    receiptId: 'env_20260110_def456',
    source: 'CSV Upload',
    tenant: 'acme-corp',
    receivedAt: new Date('2026-01-10T10:15:30Z').toISOString(),
    status: 'FAILED',
    error: 'Missing required field: customer_id',
    errorType: 'MISSING_FIELD',
    evidenceExists: true,
  }

  const receipt3: Receipt = {
    id: 'rec_003',
    receiptId: 'env_20260110_ghi789',
    source: 'API',
    tenant: 'acme-corp',
    receivedAt: new Date('2026-01-10T11:20:45Z').toISOString(),
    status: 'VALIDATING',
    evidenceExists: true,
  }

  mockReceipts.set('rec_001', receipt1)
  mockReceipts.set('rec_002', receipt2)
  mockReceipts.set('rec_003', receipt3)

  const batch1: Batch = {
    id: 'batch_001',
    batchId: 'batch_20260110_001',
    tenant: 'acme-corp',
    uploadedAt: new Date('2026-01-10T09:00:00Z').toISOString(),
    totalRecords: 150,
    canonicalized: 120,
    failed: 25,
    processing: 5,
    receipts: [receipt1, receipt2, receipt3],
    failedRows: [
      {
        receiptId: 'rec_002',
        rowNumber: 45,
        error: 'Missing required field: customer_id',
        errorType: 'MISSING_FIELD',
        uploadedAt: new Date('2026-01-10T10:15:30Z').toISOString(),
      },
    ],
  }

  mockBatches.set('batch_001', batch1)

  const evidenceTree1: EvidenceTree = {
    receiptId: 'rec_001',
    root: {
      name: 'Evidence',
      type: 'folder',
      path: '/',
      children: [
        {
          name: '2026-01-10',
          type: 'folder',
          path: '/2026-01-10',
          children: [
            {
              name: '09:45:12',
              type: 'folder',
              path: '/2026-01-10/09:45:12',
              createdAt: '2026-01-10T09:45:12Z',
              children: [
                {
                  name: 'raw-envelope.json',
                  type: 'file',
                  path: '/2026-01-10/09:45:12/raw-envelope.json',
                  createdAt: '2026-01-10T09:45:12Z',
                  hash: 'a1b2c3d4',
                  source: 'API',
                  size: 2048,
                },
                {
                  name: 'canonical-intent.json',
                  type: 'file',
                  path: '/2026-01-10/09:45:12/canonical-intent.json',
                  createdAt: '2026-01-10T09:45:13Z',
                  hash: 'e5f6g7h8',
                  source: 'Canonicalizer',
                  size: 1856,
                },
                {
                  name: 'validation-report.json',
                  type: 'file',
                  path: '/2026-01-10/09:45:12/validation-report.json',
                  createdAt: '2026-01-10T09:45:14Z',
                  hash: 'i9j0k1l2',
                  source: 'Validator',
                  size: 512,
                },
                {
                  name: 'signatures.json',
                  type: 'file',
                  path: '/2026-01-10/09:45:12/signatures.json',
                  createdAt: '2026-01-10T09:45:15Z',
                  hash: 'm3n4o5p6',
                  source: 'Signer',
                  size: 256,
                },
              ],
            },
          ],
        },
      ],
    },
  }

  const evidenceTree2: EvidenceTree = {
    receiptId: 'rec_002',
    root: {
      name: 'Evidence',
      type: 'folder',
      path: '/',
      children: [
        {
          name: '2026-01-10',
          type: 'folder',
          path: '/2026-01-10',
          children: [
            {
              name: '10:15:30',
              type: 'folder',
              path: '/2026-01-10/10:15:30',
              createdAt: '2026-01-10T10:15:30Z',
              children: [
                {
                  name: 'raw-envelope.json',
                  type: 'file',
                  path: '/2026-01-10/10:15:30/raw-envelope.json',
                  createdAt: '2026-01-10T10:15:30Z',
                  hash: 'q7r8s9t0',
                  source: 'CSV Upload',
                  size: 1536,
                },
                {
                  name: 'validation-error.json',
                  type: 'file',
                  path: '/2026-01-10/10:15:30/validation-error.json',
                  createdAt: '2026-01-10T10:15:31Z',
                  hash: 'u1v2w3x4',
                  source: 'Validator',
                  size: 384,
                },
              ],
            },
          ],
        },
      ],
    },
  }

  mockEvidence.set('rec_001', evidenceTree1)
  mockEvidence.set('rec_002', evidenceTree2)

  mockFiles.set('/2026-01-10/09:45:12/raw-envelope.json', {
    path: '/2026-01-10/09:45:12/raw-envelope.json',
    content: {
      envelope_id: 'env_20260110_abc123',
      source: 'API',
      tenant: 'acme-corp',
      received_at: '2026-01-10T09:45:12Z',
      payload: {
        customer_id: 'cust_123',
        order_id: 'ord_456',
        amount: 99.99,
      },
    },
    contentType: 'application/json',
    createdAt: '2026-01-10T09:45:12Z',
    hash: 'a1b2c3d4',
    source: 'API',
  })

  mockFiles.set('/2026-01-10/09:45:12/canonical-intent.json', {
    path: '/2026-01-10/09:45:12/canonical-intent.json',
    content: {
      intent_type: 'order_created',
      canonical_id: 'canon_abc123',
      customer_id: 'cust_123',
      order_id: 'ord_456',
      amount: 99.99,
      currency: 'USD',
      timestamp: '2026-01-10T09:45:12Z',
    },
    contentType: 'application/json',
    createdAt: '2026-01-10T09:45:13Z',
    hash: 'e5f6g7h8',
    source: 'Canonicalizer',
  })

  mockFiles.set('/2026-01-10/10:15:30/raw-envelope.json', {
    path: '/2026-01-10/10:15:30/raw-envelope.json',
    content: {
      envelope_id: 'env_20260110_def456',
      source: 'CSV Upload',
      tenant: 'acme-corp',
      received_at: '2026-01-10T10:15:30Z',
      payload: {
        order_id: 'ord_789',
        amount: 149.99,
        // Missing customer_id
      },
    },
    contentType: 'application/json',
    createdAt: '2026-01-10T10:15:30Z',
    hash: 'q7r8s9t0',
    source: 'CSV Upload',
  })

  mockFiles.set('/2026-01-10/10:15:30/validation-error.json', {
    path: '/2026-01-10/10:15:30/validation-error.json',
    content: {
      error: 'Missing required field: customer_id',
      error_type: 'MISSING_FIELD',
      field: 'customer_id',
      severity: 'error',
      timestamp: '2026-01-10T10:15:31Z',
    },
    contentType: 'application/json',
    createdAt: '2026-01-10T10:15:31Z',
    hash: 'u1v2w3x4',
    source: 'Validator',
  })
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeMockData()
}

export async function getReceipt(receiptId: string): Promise<Receipt> {
  await delay()
  
  // Simulate status progression
  const receipt = mockReceipts.get(receiptId)
  if (!receipt) {
    throw new Error(`Receipt ${receiptId} not found`)
  }

  // Simulate status updates for processing receipts
  if (receipt.status === 'VALIDATING') {
    const rand = Math.random()
    if (rand > 0.7) {
      receipt.status = 'CANONICALIZED'
    } else if (rand > 0.3) {
      receipt.status = 'FAILED'
      receipt.error = 'Validation failed: Invalid format'
      receipt.errorType = 'INVALID_VALUE'
    }
  }

  return { ...receipt }
}

export async function getBatch(batchId: string): Promise<Batch> {
  await delay()
  const batch = mockBatches.get(batchId)
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`)
  }
  return { ...batch }
}

export async function getEvidenceTree(receiptId: string): Promise<EvidenceTree> {
  await delay()
  const evidence = mockEvidence.get(receiptId)
  if (!evidence) {
    // Return empty evidence tree if not found
    return {
      receiptId,
      root: {
        name: 'Evidence',
        type: 'folder',
        path: '/',
        children: [],
      },
    }
  }
  return JSON.parse(JSON.stringify(evidence)) // Deep clone
}

export async function getEvidenceFile(receiptId: string, filePath: string): Promise<EvidenceFile> {
  await delay()
  const file = mockFiles.get(filePath)
  if (!file) {
    throw new Error(`File ${filePath} not found`)
  }
  return { ...file }
}

export async function getAllReceipts(tenant?: string): Promise<Receipt[]> {
  await delay()
  const receipts = Array.from(mockReceipts.values())
  if (tenant) {
    return receipts.filter(r => r.tenant === tenant)
  }
  return receipts
}

// Overview data types
export interface OverviewKPIs {
  intents_received_24h: number
  canonicalized_24h: number
  rejected_24h: number
  idempotency_hits_24h: number
  p95_ingest_latency_ms: number
  slo: {
    latency_ms: number
    success_rate_pct: number
  }
}

export interface ComponentHealth {
  component: string
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
  meta: string
}

export interface RecentActivity {
  time: string
  object: 'INTENT' | 'RAW_ENVELOPE'
  id: string
  source: string
  status: string
}

export interface EvidenceStatus {
  worm_active: boolean
  last_write: string
  hash_chain: 'OK' | 'BROKEN'
}

export interface OverviewData {
  environment: 'PRODUCTION' | 'SANDBOX'
  kpis: OverviewKPIs
  health: ComponentHealth[]
  errors_last_24h: Record<string, number>
  recent_activity: RecentActivity[]
  evidence: EvidenceStatus
}

export async function getOverview(tenant?: string): Promise<OverviewData> {
  await delay()
  
  // Return mock overview data matching the provided structure
  return {
    environment: 'PRODUCTION',
    kpis: {
      intents_received_24h: 12482,
      canonicalized_24h: 12301,
      rejected_24h: 181,
      idempotency_hits_24h: 2044,
      p95_ingest_latency_ms: 42,
      slo: {
        latency_ms: 60,
        success_rate_pct: 99.9
      }
    },
    health: [
      { component: 'API_GATEWAY', status: 'HEALTHY', meta: 'p95 38ms' },
      { component: 'BATCH_INGEST', status: 'DEGRADED', meta: 'last failure 14m ago' },
      { component: 'WEBHOOK_INGEST', status: 'HEALTHY', meta: 'signature OK' },
      { component: 'PII_ENCLAVE', status: 'HEALTHY', meta: 'access logged' },
      { component: 'OUTBOX_KAFKA', status: 'HEALTHY', meta: 'lag 0' }
    ],
    errors_last_24h: {
      SCHEMA_INVALID: 92,
      INSTRUMENT_FORMAT_INVALID: 47,
      IDEMPOTENCY_CONFLICT: 31,
      REJECTED_PREACC: 11,
      SYSTEM_FAILURE: 0
    },
    recent_activity: [
      {
        time: '2026-01-13T12:31:02Z',
        object: 'INTENT',
        id: 'pi_01HZX3G1AF7ZK2S8J2KZ',
        source: 'API',
        status: 'RECEIVED'
      },
      {
        time: '2026-01-13T12:30:58Z',
        object: 'RAW_ENVELOPE',
        id: 'env_20260113T123058Z_91fa',
        source: 'WEBHOOK',
        status: 'STORED_RAW'
      }
    ],
    evidence: {
      worm_active: true,
      last_write: '2026-01-13T12:31:02Z',
      hash_chain: 'OK'
    }
  }
}

export async function createReceipt(source: string, payload: unknown): Promise<Receipt> {
  await delay(1000)
  
  const receiptId = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const receipt: Receipt = {
    id: `rec_${Date.now()}`,
    receiptId,
    source,
    tenant: 'acme-corp',
    receivedAt: new Date().toISOString(),
    status: 'RECEIVED',
    evidenceExists: true,
  }

  mockReceipts.set(receipt.id, receipt)
  
  // Create evidence tree
  const date = new Date()
  const dateStr = date.toISOString().split('T')[0]
  const timeStr = date.toTimeString().split(' ')[0]
  
  const evidenceTree: EvidenceTree = {
    receiptId: receipt.id,
    root: {
      name: 'Evidence',
      type: 'folder',
      path: '/',
      children: [
        {
          name: dateStr,
          type: 'folder',
          path: `/${dateStr}`,
          children: [
            {
              name: timeStr,
              type: 'folder',
              path: `/${dateStr}/${timeStr}`,
              createdAt: date.toISOString(),
              children: [
                {
                  name: 'raw-envelope.json',
                  type: 'file',
                  path: `/${dateStr}/${timeStr}/raw-envelope.json`,
                  createdAt: date.toISOString(),
                  hash: Math.random().toString(36).substr(2, 8),
                  source,
                  size: JSON.stringify(payload).length,
                },
              ],
            },
          ],
        },
      ],
    },
  }

  mockEvidence.set(receipt.id, evidenceTree)
  
  mockFiles.set(`/${dateStr}/${timeStr}/raw-envelope.json`, {
    path: `/${dateStr}/${timeStr}/raw-envelope.json`,
    content: typeof payload === 'object' && payload !== null ? payload : String(payload),
    contentType: 'application/json',
    createdAt: date.toISOString(),
    hash: Math.random().toString(36).substr(2, 8),
    source,
  })

  return receipt
}
