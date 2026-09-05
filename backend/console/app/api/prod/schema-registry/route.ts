import { NextRequest, NextResponse } from 'next/server'
import { SchemaListResponse, Schema, SchemaFormat, SchemaStatus } from '@/types/validation'

export const dynamic = 'force-dynamic'

// Mock data for schemas
const mockSchemas: Schema[] = [
  {
    schema_name: 'payout.intent',
    version: 'v1.3',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Intent Engine',
    created_at: '2026-01-13T12:11:00Z',
    updated_at: '2026-01-28T09:15:00Z',
  },
  {
    schema_name: 'refund.intent',
    version: 'v1.1',
    format: 'AVRO',
    status: 'ACTIVE',
    used_by: 'Intent Engine',
    created_at: '2025-11-20T08:30:00Z',
    updated_at: '2026-01-15T14:22:00Z',
  },
  {
    schema_name: 'transfer.intent',
    version: 'v2.0',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Intent Engine',
    created_at: '2025-10-05T10:00:00Z',
    updated_at: '2026-02-01T11:30:00Z',
  },
  {
    schema_name: 'batch.payout',
    version: 'v1.2',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Batch Processor',
    created_at: '2025-09-15T16:45:00Z',
    updated_at: '2026-01-10T08:00:00Z',
  },
  {
    schema_name: 'webhook.callback',
    version: 'v1.0',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'zord-edge',
    created_at: '2025-08-22T13:20:00Z',
    updated_at: '2025-12-05T17:10:00Z',
  },
  {
    schema_name: 'legacy.payout',
    version: 'v0.9',
    format: 'JSON_SCHEMA',
    status: 'DEPRECATED',
    used_by: 'zord-edge',
    created_at: '2024-06-10T09:00:00Z',
    updated_at: '2025-06-15T12:00:00Z',
  },
  {
    schema_name: 'legacy.transfer',
    version: 'v0.8',
    format: 'PROTOBUF',
    status: 'DEPRECATED',
    used_by: 'Legacy Gateway',
    created_at: '2024-04-20T11:30:00Z',
    updated_at: '2025-04-01T09:45:00Z',
  },
  {
    schema_name: 'legacy.refund',
    version: 'v0.7',
    format: 'JSON_SCHEMA',
    status: 'DEPRECATED',
    used_by: 'Legacy Gateway',
    created_at: '2024-03-15T14:00:00Z',
    updated_at: '2025-03-10T10:20:00Z',
  },
  {
    schema_name: 'settlement.intent',
    version: 'v1.0',
    format: 'AVRO',
    status: 'ACTIVE',
    used_by: 'Settlement Engine',
    created_at: '2025-12-01T08:00:00Z',
    updated_at: '2026-01-20T15:30:00Z',
  },
  {
    schema_name: 'reconciliation.event',
    version: 'v1.1',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Recon Service',
    created_at: '2025-11-10T10:15:00Z',
    updated_at: '2026-01-25T13:45:00Z',
  },
  {
    schema_name: 'notification.event',
    version: 'v1.0',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Notification Service',
    created_at: '2025-10-25T12:00:00Z',
    updated_at: '2026-01-05T09:00:00Z',
  },
  {
    schema_name: 'audit.event',
    version: 'v1.2',
    format: 'AVRO',
    status: 'ACTIVE',
    used_by: 'Audit Logger',
    created_at: '2025-09-01T07:30:00Z',
    updated_at: '2026-02-02T16:20:00Z',
  },
  {
    schema_name: 'compliance.check',
    version: 'v1.0',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Compliance Engine',
    created_at: '2025-11-25T14:45:00Z',
    updated_at: '2026-01-30T11:00:00Z',
  },
  {
    schema_name: 'kyc.verification',
    version: 'v1.1',
    format: 'PROTOBUF',
    status: 'ACTIVE',
    used_by: 'KYC Service',
    created_at: '2025-10-15T09:30:00Z',
    updated_at: '2026-01-18T10:45:00Z',
  },
  {
    schema_name: 'beneficiary.validation',
    version: 'v1.0',
    format: 'JSON_SCHEMA',
    status: 'ACTIVE',
    used_by: 'Validation Service',
    created_at: '2025-12-10T11:00:00Z',
    updated_at: '2026-01-22T14:15:00Z',
  },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('page_size') || '50', 10)
  const statusFilter = searchParams.get('status') as SchemaStatus | null
  const formatFilter = searchParams.get('format') as SchemaFormat | null
  const search = searchParams.get('search') || ''

  // Filter schemas
  let filteredSchemas = [...mockSchemas]

  if (statusFilter) {
    filteredSchemas = filteredSchemas.filter(s => s.status === statusFilter)
  }

  if (formatFilter) {
    filteredSchemas = filteredSchemas.filter(s => s.format === formatFilter)
  }

  if (search) {
    const searchLower = search.toLowerCase()
    filteredSchemas = filteredSchemas.filter(
      s =>
        s.schema_name.toLowerCase().includes(searchLower) ||
        s.used_by.toLowerCase().includes(searchLower)
    )
  }

  // Sort by updated_at descending
  filteredSchemas.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  // Paginate
  const total = filteredSchemas.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filteredSchemas.slice(start, start + pageSize)

  // Calculate summary
  const activeSchemas = mockSchemas.filter(s => s.status === 'ACTIVE').length
  const deprecatedSchemas = mockSchemas.filter(s => s.status === 'DEPRECATED').length

  const response: SchemaListResponse = {
    items,
    summary: {
      total_schemas: mockSchemas.length,
      active_schemas: activeSchemas,
      deprecated_schemas: deprecatedSchemas,
      supported_formats: ['JSON_SCHEMA', 'AVRO', 'PROTOBUF'],
    },
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  }

  return NextResponse.json(response)
}
