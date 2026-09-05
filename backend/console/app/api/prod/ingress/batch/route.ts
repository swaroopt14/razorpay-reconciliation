import { NextRequest, NextResponse } from 'next/server'
import { BatchIngestionData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: BatchIngestionData = {
    health: {
      status: 'DEGRADED',
      success_rate: 96.3,
      records_per_hour: 214,
    },
    processing_queue: {
      pending_files: 3,
      pending_records: 214,
      processing_files: 1,
      processing_records: 892,
      failed_files: 9,
      failed_percent: 2.1,
    },
    format_errors: [
      { format: 'CSV', percent: 67 },
      { format: 'JSON', percent: 23 },
      { format: 'XML', percent: 10 },
    ],
    recent_batches: [
      { batch_id: 'batch_20260113_001', status: 'SUCCESS', success_rate: 100, records: 1247, timestamp: '2026-01-13T12:00:00Z' },
      { batch_id: 'batch_20260113_002', status: 'SUCCESS', success_rate: 98.2, records: 892, timestamp: '2026-01-13T11:30:00Z' },
      { batch_id: 'batch_20260113_003', status: 'PROCESSING', success_rate: 0, records: 567, timestamp: '2026-01-13T11:00:00Z' },
      { batch_id: 'batch_20260112_004', status: 'FAILED', success_rate: 12.1, records: 1892, timestamp: '2026-01-12T23:00:00Z' },
      { batch_id: 'batch_20260112_005', status: 'SUCCESS', success_rate: 99.1, records: 2341, timestamp: '2026-01-12T18:00:00Z' },
    ],
  }

  return NextResponse.json(mockData)
}
