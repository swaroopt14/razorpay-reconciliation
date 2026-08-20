/**
 * CON-P0-17 evidence timeline — no fabricated ERP/SFTP/UTR events
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/prod-api/mapEvidenceTimeline.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildEvidenceTimelineResponse,
  containsFabricatedEvidenceEvent,
  deriveTimelineFromPackFields,
} from './mapEvidenceTimeline'

{
  const empty = buildEvidenceTimelineResponse({
    evidencePackId: 'pack_empty',
    upstreamTimeline: [],
    pack: { evidence_pack_id: 'pack_empty' },
  })
  assert.equal(empty.data_available, false)
  assert.equal(empty.timeline.length, 0)
}

{
  const derived = buildEvidenceTimelineResponse({
    evidencePackId: 'pack_derived',
    upstreamTimeline: [],
    pack: {
      created_at: '2026-08-17T10:00:00Z',
      payment_instruction_received: '2026-08-17T09:00:00Z',
    },
  })
  assert.equal(derived.data_available, false)
  assert.ok(derived.timeline.every((row) => row.provenance === 'DERIVED'))
  assert.ok(derived.timeline.some((row) => row.source_field === 'created_at'))
  for (const row of derived.timeline) {
    assert.equal(containsFabricatedEvidenceEvent(row.event), false)
  }
}

{
  const authoritative = buildEvidenceTimelineResponse({
    evidencePackId: 'pack_auth',
    upstreamTimeline: [{ timestamp: '2026-08-17T11:00:00Z', event: 'Leaf committed', node_id: 'n1' }],
    pack: { created_at: '2026-08-17T10:00:00Z' },
  })
  assert.equal(authoritative.data_available, true)
  assert.equal(authoritative.timeline.length, 1)
  assert.equal(authoritative.timeline[0].event, 'Leaf committed')
  assert.equal(authoritative.timeline[0].provenance, 'AUTHORITATIVE')
}

{
  const withUtr = buildEvidenceTimelineResponse({
    evidencePackId: 'pack_utr',
    upstreamTimeline: [{ timestamp: '2026-08-17T11:00:00Z', event: 'UTR posted by bank', node_id: 'n1' }],
  })
  assert.equal(containsFabricatedEvidenceEvent(withUtr.timeline[0].event), true)
}

{
  const routeSrc = readFileSync(
    join(__dirname, '../../../app/api/v1/evidence/[evidenceId]/timeline/route.ts'),
    'utf8',
  )
  assert.doesNotMatch(routeSrc, /Payment instruction received from ERP/)
  assert.doesNotMatch(routeSrc, /Bank settlement file received via SFTP/)
  assert.doesNotMatch(routeSrc, /UTR reference auto-matched/)
}

{
  const sharedSrc = readFileSync(join(__dirname, '../../../app/api/v1/evidence/_shared.ts'), 'utf8')
  assert.doesNotMatch(sharedSrc, /received from ERP/)
  assert.doesNotMatch(sharedSrc, /received via SFTP/)
  assert.doesNotMatch(sharedSrc, /UTR reference auto-matched/)
}

{
  const derivedLabels = deriveTimelineFromPackFields({ created_at: '2026-08-17T10:00:00Z' })
  for (const row of derivedLabels) {
    assert.equal(containsFabricatedEvidenceEvent(row.event), false)
  }
}

console.log('mapEvidenceTimeline.contract.test.ts: OK')
