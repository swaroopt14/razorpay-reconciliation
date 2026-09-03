/* ── Types for the Authority Console batch data ──────────────────── */

export type BatchControl = {
  id: string
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export type BatchPolicy = {
  policyId: string
  name: string
  version: string
  status: string
  namespace: string
  approvedRails: string[]
  controls: BatchControl[]
  approvalThreshold: { amount: number; currency: string; operator: string }
}

export type BatchAgent = {
  agentId: string
  name: string
  purpose: string
  ownerRole: string
  capabilities: string[]
  limits: { maximumAmount: number; currency: string }
}

export type BatchSourceProposal = {
  proposalId: string
  sourceType: string
  sourceReference: string
  createdAt: string
  createdBy: string
  businessReason: string
}

export type BatchInstruction = {
  paymentId: string
  beneficiary: string
  amount: number
  currency: string
  rail: string
  invoice: string
}

export type AuthorityNode = {
  id: string
  name: string
  scope: string
  verification: 'verified' | 'pending' | 'failed'
}

export type AuthorityCheck = {
  name: string
  status: 'passed' | 'pending' | 'failed'
}

export type BatchAuthority = {
  status: string
  enterpriseRoot: AuthorityNode
  delegatingRole: AuthorityNode
  agentCredential: { id: string; agentId: string; verification: string }
  actionScope: { action: string; scope: string; verification: string }
  checks: AuthorityCheck[]
}

export type BatchApprover = {
  id: string
  role: string
  name: string
  permission: string
  status: 'pending' | 'approved' | 'rejected'
}

export type BatchApprovals = {
  required: number
  completed: number
  status: string
  separationOfDuties: { required: boolean; status: string }
  authentication: string
  approvers: BatchApprover[]
}

export type BatchProtocol = {
  traceId: string
  proposedAt: string
  authorityGraph: { nodes: number; edges: number }
  objects: {
    actionProposal: { id: string; status: string }
    authorityCredential: { id: string; status: string }
    policyDecisionReceipt: { id: string; status: string }
    approvalEvidence: { id: string; status: string }
    paymentActionContract: { id: string | null; status: string }
  }
}

export type AuthorityBatch = {
  batchId: string
  batchNumber: string
  status: string
  environment: string
  summary: {
    totalAmount: number
    currency: string
    instructionCount: number
    approvalType: string
    authorityStatus: string
    dispatchStatus: string
    lifecycleStatus: string
  }
  policy: BatchPolicy
  agent: BatchAgent
  sourceProposal: BatchSourceProposal
  instructions: BatchInstruction[]
  authority: BatchAuthority
  approvals: BatchApprovals
  pac: { status: string; pacId: string | null }
  protocol: BatchProtocol
}
