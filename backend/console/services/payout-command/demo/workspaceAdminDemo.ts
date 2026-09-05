/** Spec 7.18 - Workspace administration demo fixtures. */

export const WORKSPACE_ADMIN_HEADER = {
  title: 'Workspace administration',
  subtitle: 'Manage roles, access, audit history, and support.',
} as const

export type AdminTabId = 'team' | 'roles' | 'access' | 'audit' | 'support'

export const ADMIN_TABS: { id: AdminTabId; label: string }[] = [
  { id: 'team', label: 'Team' },
  { id: 'roles', label: 'Roles' },
  { id: 'access', label: 'Access policies' },
  { id: 'audit', label: 'Audit log' },
  { id: 'support', label: 'Support' },
]

/** Spec-required enterprise roles. */
export const ENTERPRISE_ROLES = [
  'Reviewer',
  'Operator',
  'Approver',
  'Finance admin',
  'Security admin',
  'Developer',
] as const

export type EnterpriseRole = (typeof ENTERPRISE_ROLES)[number]

/** Sensitive actions - exact Spec labels. */
export const SENSITIVE_ACTIONS = [
  'Reveal PII',
  'approve exception',
  'activate policy',
  'dispatch',
  'export evidence',
] as const

export type TeamMember = {
  id: string
  name: string
  email: string
  role: EnterpriseRole
  status: 'Active' | 'Invited' | 'Suspended'
  lastActive: string
  /** Demo reviewer - read-only for destructive actions. */
  ycReviewerReadonly?: boolean
}

export type RoleDef = {
  id: string
  name: EnterpriseRole
  description: string
  sensitive: Partial<Record<(typeof SENSITIVE_ACTIONS)[number], boolean>>
  members: number
}

export type AccessPolicy = {
  id: string
  name: string
  appliesTo: string
  rule: string
  status: 'Active' | 'Draft'
}

export type AuditEvent = {
  id: string
  actor: string
  action: string
  object: string
  reason: string
  timestamp: string
  before: string
  after: string
}

export type SupportContextKind = 'Action Contract' | 'Batch' | 'Payment Trace' | 'Evidence pack'

export type AdminSupportTicket = {
  id: string
  subject: string
  severity: 'Low' | 'Normal' | 'High' | 'Urgent'
  status: 'Open' | 'Pending' | 'Resolved'
  contextKind: SupportContextKind
  contextRef: string
  contextHref: string
  updated: string
  maskedNote: string
}

export const DEMO_TEAM: TeamMember[] = [
  {
    id: 'u_yc',
    name: 'Demo Reviewer',
    email: 'reviewer@yc-demo.zord',
    role: 'Reviewer',
    status: 'Active',
    lastActive: 'Just now',
    ycReviewerReadonly: true,
  },
  {
    id: 'u_ops',
    name: 'Priya Sharma',
    email: 'priya@acme.example',
    role: 'Operator',
    status: 'Active',
    lastActive: '12 Jun · 16:40',
  },
  {
    id: 'u_apr',
    name: 'James Okonkwo',
    email: 'james@acme.example',
    role: 'Approver',
    status: 'Active',
    lastActive: '12 Jun · 15:12',
  },
  {
    id: 'u_fin',
    name: 'Mei Chen',
    email: 'mei@acme.example',
    role: 'Finance admin',
    status: 'Active',
    lastActive: '11 Jun · 19:02',
  },
  {
    id: 'u_sec',
    name: 'Alex Rivera',
    email: 'alex@acme.example',
    role: 'Security admin',
    status: 'Invited',
    lastActive: '-',
  },
  {
    id: 'u_dev',
    name: 'Sam Patel',
    email: 'sam@acme.example',
    role: 'Developer',
    status: 'Active',
    lastActive: '12 Jun · 16:42',
  },
]

export const DEMO_ROLES: RoleDef[] = [
  {
    id: 'role_rev',
    name: 'Reviewer',
    description: 'Read payouts, contracts, proof. No seal, dispatch, or secret access.',
    sensitive: {
      'Reveal PII': false,
      'approve exception': false,
      'activate policy': false,
      dispatch: false,
      'export evidence': true,
    },
    members: 1,
  },
  {
    id: 'role_ops',
    name: 'Operator',
    description: 'Run intake, dispatch, and settlement observation in sandbox/live ops.',
    sensitive: {
      'Reveal PII': false,
      'approve exception': false,
      'activate policy': false,
      dispatch: true,
      'export evidence': true,
    },
    members: 1,
  },
  {
    id: 'role_apr',
    name: 'Approver',
    description: 'Resolve control exceptions and approve policy-bound releases.',
    sensitive: {
      'Reveal PII': false,
      'approve exception': true,
      'activate policy': false,
      dispatch: false,
      'export evidence': true,
    },
    members: 1,
  },
  {
    id: 'role_fin',
    name: 'Finance admin',
    description: 'Outcome review, gaps, and evidence export for finance close.',
    sensitive: {
      'Reveal PII': true,
      'approve exception': true,
      'activate policy': false,
      dispatch: false,
      'export evidence': true,
    },
    members: 1,
  },
  {
    id: 'role_sec',
    name: 'Security admin',
    description: 'Access policies, audit export, and PII reveal with logged reason.',
    sensitive: {
      'Reveal PII': true,
      'approve exception': false,
      'activate policy': true,
      dispatch: false,
      'export evidence': true,
    },
    members: 1,
  },
  {
    id: 'role_dev',
    name: 'Developer',
    description: 'Developer & Integrations credentials and webhooks - not Support.',
    sensitive: {
      'Reveal PII': false,
      'approve exception': false,
      'activate policy': false,
      dispatch: false,
      'export evidence': true,
    },
    members: 1,
  },
]

export const DEMO_ACCESS_POLICIES: AccessPolicy[] = [
  {
    id: 'ap_01',
    name: 'PII reveal requires reason',
    appliesTo: 'Finance admin · Security admin',
    rule: 'Reveal PII only with logged reason; default views stay masked.',
    status: 'Active',
  },
  {
    id: 'ap_02',
    name: 'Dispatch dual control',
    appliesTo: 'Operator',
    rule: 'Dispatch requires Approver acknowledgement when policy warned.',
    status: 'Active',
  },
  {
    id: 'ap_03',
    name: 'Demo reviewer guardrail',
    appliesTo: 'Reviewer',
    rule: 'Destructive actions (activate policy, dispatch, revoke keys) are read-only.',
    status: 'Active',
  },
  {
    id: 'ap_04',
    name: 'Evidence export scoped',
    appliesTo: 'All roles with export evidence',
    rule: 'Exports cite contract + pack IDs; raw unmasked files require Security admin.',
    status: 'Draft',
  },
]

export const DEMO_AUDIT: AuditEvent[] = [
  {
    id: 'aud_01',
    actor: 'Priya Sharma (Operator)',
    action: 'dispatch',
    object: 'PAC-0001',
    reason: 'Sandbox NEFT after seal',
    timestamp: '12 Jun 2026 · 10:02',
    before: 'Sealed · not dispatched',
    after: 'Dispatch attempt dsp_0001',
  },
  {
    id: 'aud_02',
    actor: 'James Okonkwo (Approver)',
    action: 'approve exception',
    object: 'PAY-0020',
    reason: 'Beneficiary change blocked - hold for ERP fix',
    timestamp: '12 Jun 2026 · 09:08',
    before: 'Control · Blocked',
    after: 'Control · Held (no seal)',
  },
  {
    id: 'aud_03',
    actor: 'Sam Patel (Developer)',
    action: 'rotate API key',
    object: 'key_sec_old',
    reason: 'Quarterly rotation',
    timestamp: '09 Jun 2026 · 11:20',
    before: 'Active secret',
    after: 'Rotated · secret unrecoverable',
  },
  {
    id: 'aud_04',
    actor: 'Mei Chen (Finance admin)',
    action: 'export evidence',
    object: 'EP-0019',
    reason: 'Short-settled dispute pack',
    timestamp: '12 Jun 2026 · 16:45',
    before: 'Pack in Proof Center',
    after: 'Dispute pack queued (sandbox)',
  },
  {
    id: 'aud_05',
    actor: 'Alex Rivera (Security admin)',
    action: 'role change',
    object: 'u_ops',
    reason: 'Promote Operator scopes for dispatch',
    timestamp: '08 Jun 2026 · 14:00',
    before: 'Reviewer',
    after: 'Operator',
  },
]

export const DEMO_ADMIN_TICKETS: AdminSupportTicket[] = [
  {
    id: 'tkt_01',
    subject: 'Short settlement on PAY-0019',
    severity: 'High',
    status: 'Open',
    contextKind: 'Evidence pack',
    contextRef: 'EP-0019',
    contextHref: '/proof/EP-0019?demo=sandbox',
    updated: '12 Jun · 16:50',
    maskedNote: 'Amounts masked in Support by default - open linked objects for authorised reveal.',
  },
  {
    id: 'tkt_02',
    subject: 'Trace delay after dispatch',
    severity: 'Normal',
    status: 'Pending',
    contextKind: 'Payment Trace',
    contextRef: 'PAY-0001',
    contextHref: '/payments/PAY-0001/trace?demo=sandbox',
    updated: '12 Jun · 11:10',
    maskedNote: 'Support cannot expose unmasked financial data by default.',
  },
  {
    id: 'tkt_03',
    subject: 'Batch mapping question',
    severity: 'Low',
    status: 'Resolved',
    contextKind: 'Batch',
    contextRef: 'batch-001',
    contextHref: '/payouts/intents?demo=sandbox',
    updated: '11 Jun · 18:00',
    maskedNote: 'Context links to the exact object - no sensitive file copy required.',
  },
]

export const CONTEXT_OPTIONS: { kind: SupportContextKind; ref: string; href: string }[] = [
  { kind: 'Action Contract', ref: 'PAC-0001', href: '/contracts/PAC-0001?demo=sandbox' },
  { kind: 'Batch', ref: 'batch-001', href: '/payouts/intents?demo=sandbox' },
  { kind: 'Payment Trace', ref: 'PAY-0001', href: '/payments/PAY-0001/trace?demo=sandbox' },
  { kind: 'Evidence pack', ref: 'EP-0019', href: '/proof/EP-0019?demo=sandbox' },
]
