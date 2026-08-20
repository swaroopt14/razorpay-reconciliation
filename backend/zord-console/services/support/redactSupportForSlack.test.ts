/**
 * CON-P1-11 acceptance: account / VPA / email / UTR redacted in Slack payload.
 * Run: npx tsx services/support/redactSupportForSlack.test.ts
 */
import assert from 'node:assert/strict'
import { buildSupportSlackPayload } from './supportSlack.server'
import { minimizeTenantRef, redactSupportTextForSlack } from './redactSupportForSlack'
import type { SupportTicket } from '@/services/payout-command/support/supportTickets'

const sample =
  'Please check account 123456789012 and VPA merchant@okaxis. Contact ops@acme.com. UTR HDFC20260507001234 failed.'

const redacted = redactSupportTextForSlack(sample)
assert.match(redacted.text, /\[REDACTED_ACCOUNT\]/)
assert.match(redacted.text, /\[REDACTED_VPA\]/)
assert.match(redacted.text, /\[REDACTED_EMAIL\]/)
assert.match(redacted.text, /\[REDACTED_UTR\]/)
assert.doesNotMatch(redacted.text, /123456789012/)
assert.doesNotMatch(redacted.text, /merchant@okaxis/)
assert.doesNotMatch(redacted.text, /ops@acme\.com/)
assert.doesNotMatch(redacted.text, /HDFC20260507001234/)
assert.ok(redacted.classes.includes('account'))
assert.ok(redacted.classes.includes('vpa'))
assert.ok(redacted.classes.includes('email'))
assert.ok(redacted.classes.includes('utr'))

assert.match(minimizeTenantRef('tenant-abcdef-12345678'), /tenant…/)
assert.doesNotMatch(minimizeTenantRef('tenant-abcdef-12345678'), /tenant-abcdef-12345678/)

const now = new Date().toISOString()
const ticket: SupportTicket = {
  id: 't-test-1',
  ticketNumber: '42',
  category: 'settlement',
  topic: 'UTR mismatch',
  status: 'open',
  state: 'active',
  preview: 'redacted in slack path',
  createdAt: now,
  updatedAt: now,
  unreadForCustomer: 0,
  contactEmail: 'finance@customer.com',
  messages: [
    {
      id: 'm1',
      kind: 'chat',
      body: sample,
      createdAt: now,
      author: 'You',
      role: 'customer',
    },
  ],
}

const payload = buildSupportSlackPayload({
  kind: 'new_ticket',
  tenantId: 'tenant-sensitive-workspace-id',
  ticket,
})
const serialized = JSON.stringify(payload)
assert.doesNotMatch(serialized, /123456789012/)
assert.doesNotMatch(serialized, /merchant@okaxis/)
assert.doesNotMatch(serialized, /ops@acme\.com/)
assert.doesNotMatch(serialized, /HDFC20260507001234/)
assert.doesNotMatch(serialized, /finance@customer\.com/)
assert.doesNotMatch(serialized, /tenant-sensitive-workspace-id/)
assert.match(serialized, /REDACTED_ACCOUNT|REDACTED_VPA|REDACTED_EMAIL|REDACTED_UTR/)
assert.match(serialized, /Full content retained in Zord support store only/)

console.log('redactSupportForSlack.test.ts: ok')
