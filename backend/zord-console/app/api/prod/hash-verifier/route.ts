import { NextRequest, NextResponse } from 'next/server'
import { HashVerifierResponse, VerificationResult } from '@/types/hash-verifier'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: HashVerifierResponse = {
    recent_verifications: [
      {
        verification_id: 'hv_1402',
        timestamp: '2026-01-13T14:02:00Z',
        mode: 'RANGE',
        status: 'VERIFIED',
        records_verified: 129,
        chain_breaks: 0,
        performed_by: 'admin_compliance_1@arealis.com',
        duration_ms: 842,
      },
      {
        verification_id: 'hv_1401',
        timestamp: '2026-01-13T12:30:00Z',
        mode: 'ENVELOPE_ID',
        status: 'VERIFIED',
        records_verified: 1,
        chain_breaks: 0,
        performed_by: 'admin_ops_2@arealis.com',
        duration_ms: 23,
      },
      {
        verification_id: 'hv_1400',
        timestamp: '2026-01-13T09:15:00Z',
        mode: 'RANGE',
        status: 'VERIFIED',
        records_verified: 500,
        chain_breaks: 0,
        performed_by: 'admin_compliance_1@arealis.com',
        duration_ms: 3241,
      },
      {
        verification_id: 'hv_1399',
        timestamp: '2026-01-12T18:00:00Z',
        mode: 'INTENT_ID',
        status: 'VERIFIED',
        records_verified: 1,
        chain_breaks: 0,
        performed_by: 'admin_forensics@arealis.com',
        duration_ms: 18,
      },
      {
        verification_id: 'hv_1398',
        timestamp: '2026-01-12T14:22:00Z',
        mode: 'RANGE',
        status: 'VERIFIED',
        records_verified: 1000,
        chain_breaks: 0,
        performed_by: 'audit_bot@arealis.com',
        duration_ms: 6482,
      },
    ],
    chain_head: {
      hash: 'd72b0a4e8f3c1b9a2d5e6f7c8a9b0d1e2f3c4a5b6d7e8f9a0b1c2d3e4f5a6b7c',
      evidence_id: 'env_20260113T143900Z_HEAD',
      timestamp: '2026-01-13T14:39:00Z',
      sequence: 12482,
    },
    chain_stats: {
      total_records: 12482,
      oldest_record: '2025-06-01T00:00:00Z',
      newest_record: '2026-01-13T14:39:00Z',
      algorithm: 'SHA-256',
    },
  }

  return NextResponse.json(mockData)
}

export async function POST(request: NextRequest) {
  // Simulate verification process
  await new Promise(resolve => setTimeout(resolve, 800))

  const body = await request.json()
  const { mode, start_id, end_id, intent_id, envelope_id } = body

  // Generate mock verification result
  const records = []
  const recordCount = mode === 'RANGE' ? 129 : 1

  for (let i = 1; i <= Math.min(recordCount, 50); i++) {
    const prevHash = i === 1 
      ? '0000000000000000000000000000000000000000000000000000000000000000'
      : `${String.fromCharCode(96 + ((i - 1) % 26))}${(i - 1).toString(16).padStart(2, '0')}f${Math.random().toString(16).substring(2, 58)}`
    
    const currentHash = `${String.fromCharCode(96 + (i % 26))}${i.toString(16).padStart(2, '0')}f${Math.random().toString(16).substring(2, 58)}`
    
    records.push({
      sequence: i,
      evidence_id: mode === 'ENVELOPE_ID' 
        ? envelope_id 
        : mode === 'INTENT_ID'
          ? intent_id
          : `env_20260113T${(120000 + i).toString().substring(0, 6)}Z_${i.toString(16).padStart(4, '0').toUpperCase()}`,
      evidence_type: 'ENVELOPE' as const,
      stored_hash: currentHash,
      computed_hash: currentHash,
      previous_hash: prevHash,
      status: i === recordCount ? 'CHAIN_HEAD' as const : 'STORED_EQUALS_COMPUTED' as const,
      timestamp: new Date(Date.now() - (recordCount - i) * 60000).toISOString(),
      payload_size_bytes: 1024 + Math.floor(Math.random() * 4096),
    })
  }

  const result: VerificationResult = {
    verification_id: `hv_${Date.now().toString().substring(5)}`,
    status: 'VERIFIED',
    mode,
    algorithm: 'SHA-256',
    start_id: start_id || envelope_id || intent_id || records[0]?.evidence_id || '',
    end_id: end_id || envelope_id || intent_id || records[records.length - 1]?.evidence_id || '',
    total_records: recordCount,
    verified_records: recordCount,
    chain_breaks: 0,
    verification_time_ms: 842,
    started_at: new Date(Date.now() - 842).toISOString(),
    completed_at: new Date().toISOString(),
    performed_by: 'admin_compliance_1@arealis.com',
    chain_head_hash: records[records.length - 1]?.stored_hash || '',
    chain_tail_hash: records[0]?.stored_hash || '',
    records,
    mismatches: [],
  }

  return NextResponse.json(result)
}
