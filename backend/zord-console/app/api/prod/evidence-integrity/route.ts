import { NextRequest, NextResponse } from 'next/server'
import { EvidenceIntegrityResponse } from '@/types/evidence-integrity'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 80))

  const now = new Date()
  const lastCheck = new Date(now.getTime() - 2 * 60 * 1000) // 2 minutes ago
  const nextCheck = new Date(now.getTime() + 3 * 60 * 1000) // 3 minutes from now

  const mockData: EvidenceIntegrityResponse = {
    integrity: {
      status: 'VERIFIED',
      total_records: 12482,
      verified_records: 12482,
      integrity_percent: 100,
      last_check_at: lastCheck.toISOString(),
      next_check_at: nextCheck.toISOString(),
      check_frequency_seconds: 300,
    },
    coverage: {
      envelopes_total: 12482,
      envelopes_covered: 12482,
      envelopes_percent: 100,
      intents_total: 12301,
      intents_covered: 12301,
      intents_percent: 100,
      dlq_total: 47,
      dlq_covered: 47,
      dlq_percent: 100,
      contracts_total: 11987,
      contracts_covered: 11987,
      contracts_percent: 100,
    },
    compliance: {
      storage_mode: 'WORM',
      object_lock_status: 'ENABLED',
      object_lock_mode: 'COMPLIANCE',
      retention_years: 7,
      retention_until: '2033-01-13T00:00:00Z',
      early_delete_blocked: true,
      legal_hold_enabled: false,
      compliance_standards: ['RBI', 'SEBI', 'SOC2', 'ISO27001'],
    },
    hash_chain: {
      algorithm: 'SHA-256',
      chains_verified: 12482,
      chains_total: 12482,
      broken_chains: 0,
      chain_head_hash: 'd72b0a4e8f3c1b9a2d5e6f7c8a9b0d1e2f3c4a5b6d7e8f9a0b1c2d3e4f5a6b7c',
      chain_tail_hash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      last_block_timestamp: '2026-01-13T12:39:00Z',
      verification_duration_ms: 847,
    },
    recent_events: [
      {
        event_id: 'evt_001',
        timestamp: '2026-01-13T12:41:00Z',
        event_type: 'VERIFICATION_OK',
        status: 'success',
        description: 'Full chain verification completed',
        records_affected: 12482,
        actor: 'zord-integrity-service',
      },
      {
        event_id: 'evt_002',
        timestamp: '2026-01-13T11:02:00Z',
        event_type: 'BATCH_APPENDED',
        status: 'success',
        description: 'New evidence batch appended to chain',
        records_affected: 142,
        actor: 'zord-vault-journal',
      },
      {
        event_id: 'evt_003',
        timestamp: '2026-01-13T09:15:00Z',
        event_type: 'RETENTION_OK',
        status: 'success',
        description: 'Retention policy compliance verified',
        records_affected: 12340,
        actor: 'zord-compliance-checker',
      },
      {
        event_id: 'evt_004',
        timestamp: '2026-01-13T06:00:00Z',
        event_type: 'COMPLIANCE_CHECK',
        status: 'success',
        description: 'Daily SOC2 compliance check passed',
        records_affected: 12340,
        actor: 'zord-compliance-checker',
      },
      {
        event_id: 'evt_005',
        timestamp: '2026-01-13T00:00:00Z',
        event_type: 'CHAIN_VERIFIED',
        status: 'success',
        description: 'Nightly full chain cryptographic verification',
        records_affected: 12198,
        actor: 'zord-integrity-service',
        metadata: {
          duration_ms: '12847',
          blocks_checked: '12198',
        },
      },
      {
        event_id: 'evt_006',
        timestamp: '2026-01-12T18:30:00Z',
        event_type: 'BATCH_APPENDED',
        status: 'success',
        description: 'Evening batch appended',
        records_affected: 89,
        actor: 'zord-vault-journal',
      },
      {
        event_id: 'evt_007',
        timestamp: '2026-01-12T12:00:00Z',
        event_type: 'VERIFICATION_OK',
        status: 'success',
        description: 'Midday verification completed',
        records_affected: 12109,
        actor: 'zord-integrity-service',
      },
    ],
    audit_metrics: {
      verifications_24h: 288,
      verifications_success_rate: 100,
      batches_appended_24h: 17,
      compliance_checks_24h: 24,
      anomalies_detected_24h: 0,
      last_anomaly_at: null,
    },
  }

  return NextResponse.json(mockData)
}
