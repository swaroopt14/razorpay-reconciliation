import { SANDBOX_DOCS_LINKS } from '@/services/payout-command/sandbox-data'

export type SupportDocLink = {
  id: string
  label: string
  description: string
  href: string
  external?: boolean
}

/** In-product doc nav for Support + live console (opens Zord docs in new tab). */
export const SUPPORT_DOC_NAV: SupportDocLink[] = [
  {
    id: 'api',
    label: 'API reference',
    description: 'REST endpoints, auth, and idempotency',
    href: SANDBOX_DOCS_LINKS.apiReference,
    external: true,
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description: 'Signing, retries, and event catalog',
    href: SANDBOX_DOCS_LINKS.webhookGuide,
    external: true,
  },
  {
    id: 'postman',
    label: 'Postman collection',
    description: 'Sandbox examples you can import',
    href: SANDBOX_DOCS_LINKS.postmanCollection,
    external: true,
  },
  {
    id: 'intents',
    label: 'Payment instructions',
    description: 'Intent Journal, batches, and DLQ',
    href: `${SANDBOX_DOCS_LINKS.apiReference}#payment-intents`,
    external: true,
  },
  {
    id: 'settlement',
    label: 'Settlement observations',
    description: 'Matching, bank refs, and client_batch_id',
    href: `${SANDBOX_DOCS_LINKS.apiReference}#settlement`,
    external: true,
  },
  {
    id: 'evidence',
    label: 'Evidence packs',
    description: 'Proof export and verification',
    href: `${SANDBOX_DOCS_LINKS.apiReference}#evidence`,
    external: true,
  },
  {
    id: 'support-playbook',
    label: 'Support playbook',
    description: 'SLAs, escalation, and what to attach',
    href: 'https://docs.zord.com/support',
    external: true,
  },
]

export const SUPPORT_TICKET_CATEGORIES = [
  'Account configuration',
  'Settlement related',
  'Payment instructions / Intent',
  'API & integrations',
  'Evidence & audit',
  'Billing',
  'Other',
] as const
