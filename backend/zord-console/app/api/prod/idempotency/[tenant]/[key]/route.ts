import { NextRequest, NextResponse } from 'next/server'
import { IdempotencyKeyDetail, ReplayAttempt } from '@/types/validation'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; key: string }> }
) {
  const { tenant, key } = await params
  const decodedTenant = decodeURIComponent(tenant)
  const decodedKey = decodeURIComponent(key)

  // Determine status based on key pattern - for demo purposes
  const isRejected = decodedKey.includes('dup') || decodedKey.includes('rejected')
  const status = isRejected ? 'REJECTED' : 'CONSUMED'

  // Generate realistic timestamps
  const firstSeen = new Date('2026-01-15T11:26:38Z')
  const envelopeId = `env_${firstSeen.toISOString().split('T')[0].replace(/-/g, '')}T${firstSeen.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6)}Z_NKL7QO`
  const intentId = status === 'CONSUMED' 
    ? `pi_20260115_91XK`
    : undefined

  // Generate replay attempts for consumed keys
  const replayCount = status === 'CONSUMED' ? 2 : (status === 'REJECTED' ? Math.floor(Math.random() * 3) + 1 : 0)
  const replayAttemptPool: ReplayAttempt[] = [
    {
      timestamp: '2026-01-15T11:27:01Z',
      outcome: 'blocked',
      source_ip: '10.0.1.45',
    },
    {
      timestamp: '2026-01-15T11:27:14Z',
      outcome: 'blocked',
      source_ip: '10.0.1.45',
    },
  ]
  const replayAttempts = replayCount > 0 ? replayAttemptPool.slice(0, replayCount) : []

  // Build the detailed response
  const detail: IdempotencyKeyDetail = {
    // Basic info
    tenant: decodedTenant,
    idempotency_key: decodedKey,
    status,
    first_seen: firstSeen.toISOString(),
    expires_at: new Date(firstSeen.getTime() + 86400000 * 7).toISOString(), // 7 days TTL
    
    // Lineage
    first_envelope_id: envelopeId,
    canonical_intent_id: intentId,
    tenant_id: '11111111-1111-1111-1111-111111111111',
    
    // Response snapshot (what client received)
    response_snapshot: status === 'CONSUMED' 
      ? {
          intent_id: intentId,
          status: 'ACCEPTED',
          amount: '125000.00',
          currency: 'INR',
          beneficiary: {
            account_number: '****4567',
            ifsc: 'HDFC0001234',
          },
          created_at: firstSeen.toISOString(),
          idempotency_used: true,
        }
      : {
          error: 'DUPLICATE_REQUEST',
          message: 'Request with this idempotency key was already processed',
          original_intent_id: `pi_20260115_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          first_processed_at: new Date(firstSeen.getTime() - 3600000).toISOString(),
          idempotency_key: decodedKey,
        },
    
    // Request hash
    request_hash: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678901234',
    
    // Replay tracking
    replay_count: replayCount,
    duplicates_blocked: replayCount,
    last_replay_at: replayAttempts.length > 0 
      ? replayAttempts[replayAttempts.length - 1].timestamp 
      : undefined,
    final_outcome: status === 'CONSUMED' ? 'ACCEPTED' : 'REJECTED',
    
    // Detailed replay attempts
    replay_attempts: replayAttempts,
    
    // Enforcement semantics
    enforcement: {
      scope: 'tenant_id + idempotency_key',
      enforced_by: 'zord-edge',
      checked_at_stage: 'PRE-PARSE',
      on_replay_actions: [
        'Skip parsing',
        'Skip schema validation',
        'Return stored response (no side effects)',
      ],
    },
    
    // Audit & Evidence
    audit: {
      record_immutable: true,
      stored_in_worm: true,
      evidence_ref: `worm://prod/idempotency/${decodedKey}`,
      evidence_receipt_id: `ev_${firstSeen.toISOString().split('T')[0].replace(/-/g, '')}_idmp_${Math.random().toString(36).substring(2, 8)}`,
    },
  }

  return NextResponse.json(detail)
}
