import type { LeafNode } from './evidenceGraphTypes'

export type ProvenanceField = { label: string; value: string; mono?: boolean }

export type LeafProvenance = {
  sourceKind: string
  source: ProvenanceField[]
  provenance: ProvenanceField[]
  sourceSpecificTitle: string
  sourceSpecific: ProvenanceField[]
  lineage: string[]
}

function eventId(node: LeafNode): string {
  const slug = node.stableRef.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 18)
  return `evt_${slug || node.id}`
}

function providerRef(node: LeafNode): string {
  const head = node.stableRef.split(':')[0] || node.stableRef
  return head
}

export function leafProvenance(node: LeafNode, packId: string, merkleShort: string): LeafProvenance {
  const type = node.itemType
  const received = node.receivedAt || '—'
  const commonSource: ProvenanceField[] = [
    { label: 'System', value: node.source || 'Intent Journal' },
    { label: 'Service', value: node.sourceService || 'zord-proof-center', mono: true },
    { label: 'Source record', value: node.stableRef, mono: true },
    { label: 'Source version', value: node.version, mono: true },
    { label: 'Received', value: received },
  ]

  const lineage = [
    node.name,
    'Evidence item',
    'Proof bundle',
    `Merkle root ${merkleShort}`,
  ]

  if (type === 'CANONICAL_INTENT' || type === 'RAW_INGRESS_ENVELOPE') {
    return {
      sourceKind: 'Razorpay API',
      source: commonSource,
      provenance: [
        { label: 'Source type', value: 'Canonical domain record' },
        { label: 'Source event', value: 'intent.created', mono: true },
        { label: 'Source event ID', value: eventId(node), mono: true },
        { label: 'Source hash', value: node.hashFull, mono: true },
        { label: 'Captured at', value: received },
        { label: 'Provider', value: 'Razorpay' },
        { label: 'Provider reference', value: providerRef(node), mono: true },
      ],
      sourceSpecificTitle: 'Razorpay API',
      sourceSpecific: [
        { label: 'Provider', value: 'Razorpay' },
        { label: 'Endpoint', value: 'Payout / Payment API' },
        { label: 'Provider ID', value: providerRef(node), mono: true },
        { label: 'Retrieved at', value: received },
        { label: 'Request ID', value: `req_${node.id}`, mono: true },
        { label: 'Source hash', value: node.hashShort, mono: true },
      ],
      lineage: ['Razorpay payment', ...lineage],
    }
  }

  if (type === 'OUTCOME_SIGNAL' || type === 'FUSED_OUTCOME' || type === 'PROVIDER_ACK') {
    const eventName =
      type === 'PROVIDER_ACK' ? 'provider.ack' : type === 'FUSED_OUTCOME' ? 'outcome.fused' : 'outcome.observed'
    const integrity = node.status === 'valid' ? 'Verified' : node.status === 'missing' ? 'Missing' : 'Invalid'
    return {
      sourceKind: node.source || 'Bank / provider feed',
      source: commonSource,
      provenance: [
        { label: 'Source type', value: node.source || 'Bank / provider feed' },
        { label: 'Source event', value: eventName, mono: true },
        { label: 'Source event ID', value: eventId(node), mono: true },
        { label: 'Integrity', value: integrity },
        { label: 'Payload hash', value: node.hashFull, mono: true },
        { label: 'Received at', value: received },
      ],
      sourceSpecificTitle: 'Outcome signal',
      sourceSpecific: [
        { label: 'Source', value: node.source || 'Bank / provider feed' },
        { label: 'Event', value: eventName, mono: true },
        { label: 'Event ID', value: eventId(node), mono: true },
        { label: 'Received at', value: received },
        { label: 'Integrity', value: integrity },
        { label: 'Payload hash', value: node.hashShort, mono: true },
      ],
      lineage,
    }
  }

  if (type === 'RAW_SETTLEMENT_ENVELOPE' || type === 'CANONICAL_SETTLEMENT_OBSERVATION') {
    const isBank = /bank/i.test(node.name) || /bank/i.test(node.source)
    if (isBank) {
      return {
        sourceKind: 'Bank statement',
        source: [{ label: 'System', value: node.source || 'HDFC Bank CSV' }, ...commonSource.slice(1)],
        provenance: [
          { label: 'Source type', value: 'Bank statement' },
          { label: 'Source event', value: 'bank.credit.observed', mono: true },
          { label: 'Source event ID', value: eventId(node), mono: true },
          { label: 'Source hash', value: node.hashFull, mono: true },
          { label: 'Observed', value: received },
        ],
        sourceSpecificTitle: 'Bank',
        sourceSpecific: [
          { label: 'Source', value: 'HDFC Bank' },
          { label: 'Account', value: '•••• 4421', mono: true },
          { label: 'Credit / Debit', value: 'Credit' },
          { label: 'Statement', value: 'hdfc_2026_06_12.csv', mono: true },
          { label: 'Row', value: '#418', mono: true },
          { label: 'Source hash', value: node.hashShort, mono: true },
        ],
        lineage: ['Bank transaction', ...lineage],
      }
    }
    return {
      sourceKind: 'Settlement file',
      source: [{ label: 'System', value: 'Razorpay Settlement XLSX' }, ...commonSource.slice(1)],
      provenance: [
        { label: 'Source type', value: 'Settlement file' },
        { label: 'Source event', value: 'settlement.line.ingested', mono: true },
        { label: 'Source event ID', value: eventId(node), mono: true },
        { label: 'Source hash', value: node.hashFull, mono: true },
        { label: 'Observed', value: received },
      ],
      sourceSpecificTitle: 'Settlement',
      sourceSpecific: [
        { label: 'Source', value: 'Razorpay Settlement XLSX' },
        { label: 'Settlement ID', value: providerRef(node), mono: true },
        { label: 'Source file', value: 'settlement_2026_06_12.xlsx', mono: true },
        { label: 'Row', value: '#182', mono: true },
        { label: 'Pack', value: packId, mono: true },
      ],
      lineage: ['Razorpay settlement', ...lineage],
    }
  }

  if (type === 'ATTACHMENT_DECISION' || type === 'VARIANCE_DECISION') {
    return {
      sourceKind: 'Reconciliation',
      source: [{ label: 'System', value: 'Finance Controller' }, ...commonSource.slice(1)],
      provenance: [
        { label: 'Source type', value: 'Reconciliation decision' },
        { label: 'Source event', value: 'recon.decision', mono: true },
        { label: 'Source event ID', value: eventId(node), mono: true },
        { label: 'Source hash', value: node.hashFull, mono: true },
        { label: 'Decided at', value: received },
      ],
      sourceSpecificTitle: 'Reconciliation',
      sourceSpecific: [
        { label: 'Method', value: type === 'VARIANCE_DECISION' ? 'Amount compare' : 'Exact UTR' },
        { label: 'Decision', value: type === 'VARIANCE_DECISION' ? 'VARIANCE' : 'MATCHED', mono: true },
        { label: 'Evidence item', value: node.itemType, mono: true },
      ],
      lineage: ['Reconciliation decision', ...lineage],
    }
  }

  if (type === 'DISPATCH_ATTEMPT') {
    return {
      sourceKind: 'Dispatch',
      source: commonSource,
      provenance: [
        { label: 'Source type', value: 'Dispatch attempt' },
        { label: 'Source event', value: 'payout.dispatch', mono: true },
        { label: 'Source event ID', value: eventId(node), mono: true },
        { label: 'Request hash', value: node.hashFull, mono: true },
        { label: 'Sent at', value: received },
      ],
      sourceSpecificTitle: 'Attempt ledger',
      sourceSpecific: [
        { label: 'Attempt', value: node.stableRef, mono: true },
        { label: 'Idempotency', value: `idem_${providerRef(node)}`, mono: true },
        { label: 'Request hash', value: node.hashShort, mono: true },
      ],
      lineage,
    }
  }

  return {
    sourceKind: node.source || 'Evidence',
    source: commonSource,
    provenance: [
      { label: 'Source type', value: 'Evidence artifact' },
      { label: 'Source event', value: `${String(type).toLowerCase()}.sealed`, mono: true },
      { label: 'Source event ID', value: eventId(node), mono: true },
      { label: 'Source hash', value: node.hashFull, mono: true },
      { label: 'Captured at', value: received },
    ],
    sourceSpecificTitle: 'Artifact',
    sourceSpecific: [
      { label: 'Item type', value: type, mono: true },
      { label: 'Stable ref', value: node.stableRef, mono: true },
      { label: 'Pack', value: packId, mono: true },
    ],
    lineage,
  }
}
