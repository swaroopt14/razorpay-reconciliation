/** Versioned protocol object catalogue for Protocol Inspector. */

export const MEDIA_ACTION = 'application/vnd.zord.action.v1+json'
export const MEDIA_EVIDENCE = 'application/vnd.zord.evidence.v1+json'

export const PROTOCOL_SCHEMAS = {
  RawEnvelope: {
    $id: 'zord.evidence.v1.RawEnvelope',
    type: 'object',
    required: ['envelope_id', 'trace_id', 'source', 'received_at', 'payload_hash'],
  },
  ActionProposal: {
    $id: 'zord.action.v1.ActionProposal',
    type: 'object',
    required: ['proposal_id', 'trace_id', 'status', 'confidence', 'source_hashes'],
  },
  AuthorityCredential: {
    $id: 'zord.action.v1.AuthorityCredential',
    type: 'object',
    required: ['credential_id', 'principal', 'subject', 'key_thumbprint'],
  },
  AgentCapabilityProfile: {
    $id: 'zord.action.v1.AgentCapabilityProfile',
    type: 'object',
    required: [
      'agent_id',
      'tenant_id',
      'permitted_action_types',
      'permitted_tools',
      'max_amount_per_action',
      'key_thumbprint',
      'policy_namespace',
      'signature',
    ],
  },
  PolicyDecisionReceipt: {
    $id: 'zord.action.v1.PolicyDecisionReceipt',
    type: 'object',
    required: ['receipt_id', 'decision', 'policy_id', 'policy_version', 'policy_hash'],
  },
  PaymentActionContract: {
    $id: 'zord.action.v1.PaymentActionContract',
    type: 'object',
    required: [
      'spec_version',
      'pac_id',
      'trace_id',
      'principal',
      'actor',
      'action',
      'authority',
      'execution_constraints',
      'digest',
      'signature',
    ],
  },
  DispatchReceipt: {
    $id: 'zord.action.v1.DispatchReceipt',
    type: 'object',
    required: ['receipt_id', 'pac_id', 'idempotency_key', 'connector_id', 'request_digest'],
  },
  SignalEnvelope: {
    $id: 'zord.evidence.v1.SignalEnvelope',
    type: 'object',
    required: ['envelope_id', 'trace_id', 'provider', 'raw_payload_hash', 'dedupe_fingerprint', 'received_at'],
  },
  LifecycleTransitionReceipt: {
    $id: 'zord.evidence.v1.LifecycleTransitionReceipt',
    type: 'object',
    required: ['receipt_id', 'trace_id', 'previous_state', 'next_state', 'accepted_evidence_ids'],
  },
  FinalityCertificate: {
    $id: 'zord.evidence.v1.FinalityCertificate',
    type: 'object',
    required: ['certificate_id', 'trace_id', 'finality_profile', 'conclusion', 'supporting_evidence_ids'],
  },
  ProofPackManifest: {
    $id: 'zord.evidence.v1.ProofPackManifest',
    type: 'object',
    required: ['pack_id', 'trace_id', 'object_digests', 'merkle_root', 'evidence_service_signature'],
  },
}

/**
 * Interoperability registry — Planned adapters only.
 * Status stays PLANNED until a live binding exists. Do not label these Production.
 */
export const COMPATIBILITY = [
  {
    protocol: 'MCP',
    status: 'PLANNED',
    binding_type: 'Agent-to-Tool Context',
    transport: 'JSON-RPC / HTTP SSE',
    mapping_keys: ['tool_name', 'pac_id', 'trace_id', 'idempotency_key'],
    exposed_tools: ['propose_action', 'evaluate_authority', 'verify_proof_pack'],
    note: 'Offers guarded Zord tools; requires a valid PAC for execution dispatch.',
  },
  {
    protocol: 'A2A',
    status: 'PLANNED',
    binding_type: 'Agent Messaging & Cards',
    transport: 'HTTPS task artifacts',
    mapping_keys: ['skill_id', 'task_id', 'receipt_digest', 'pac_id'],
    note: 'Exposes core Zord skills and transmits cryptographically signed receipts as task artifacts.',
  },
  {
    protocol: 'AP2',
    status: 'PLANNED',
    binding_type: 'Upstream Purchase Mandates',
    transport: 'HTTPS mandate token',
    mapping_keys: ['mandate_id', 'credential_id', 'principal', 'key_thumbprint'],
    note: 'Accepts user-authorized intent tokens as valid upstream credentials inside AuthorityCredential tracking paths.',
  },
  {
    protocol: 'Mastercard VI',
    status: 'PLANNED',
    binding_type: 'SD-JWT Delegation Chains',
    transport: 'SD-JWT / ISO 18013-5',
    mapping_keys: ['sd_jwt', 'authority.credential_refs', 'key_thumbprint'],
    note: 'Maps structured checkout-payment integrity blocks into internal authority verification arrays.',
  },
  {
    protocol: 'Visa TAP',
    status: 'PLANNED',
    binding_type: 'Merchant Edge Identity',
    transport: 'mTLS attestation',
    mapping_keys: ['tap_attestation', 'connector_id', 'actor.key_thumbprint'],
    note: 'Utilized exclusively for agent and transport security attestation metrics across connected interfaces.',
  },
  {
    protocol: 'UCP / ACP',
    status: 'PLANNED',
    binding_type: 'Commerce Catalog Linking',
    transport: 'HTTPS catalog / cart context',
    mapping_keys: ['order_ref', 'cart_id', 'business_context.invoice_refs'],
    note: 'Ingests broad enterprise ordering and cart context rules to drive background collections pipelines.',
  },
  {
    protocol: 'x402',
    status: 'PLANNED',
    binding_type: 'HTTP Pricing Loop',
    transport: 'HTTP 402 + signed voucher',
    mapping_keys: ['voucher_digest', 'pac_id', 'execution_constraints.idempotency_key'],
    note: 'Accepts native signed execution vouchers when independent agents handle infrastructure procurement tasks.',
  },
  {
    protocol: 'Stripe SPT',
    status: 'PLANNED',
    binding_type: 'Scoped Payment Tokens',
    transport: 'HTTPS token exchange',
    mapping_keys: ['spt', 'amount_minor', 'expiry', 'dispatch_credentials'],
    note: 'Processes temporary time/amount restricted token authorizations directly into dispatch credentials.',
  },
]
