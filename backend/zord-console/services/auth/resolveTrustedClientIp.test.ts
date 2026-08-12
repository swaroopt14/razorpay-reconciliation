/**
 * Lightweight CON-P1-04 checks (run: npx tsx services/auth/resolveTrustedClientIp.test.ts)
 */
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { buildForwardHeaders, resolveTrustedClientIp, sanitizeSingleIp } from './server'

function req(headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/auth/login', { headers })
}

assert.equal(sanitizeSingleIp(' 8.8.8.8 '), '8.8.8.8')
assert.equal(sanitizeSingleIp('1.2.3.4, 5.6.7.8'), null)
assert.equal(sanitizeSingleIp('not-an-ip'), null)

process.env.TRUST_PROXY_HEADERS = 'false'
assert.equal(
  resolveTrustedClientIp(req({ 'x-forwarded-for': '9.9.9.9' })),
  null,
  'client XFF ignored when proxy trust is off',
)

process.env.TRUST_PROXY_HEADERS = 'true'
assert.equal(
  resolveTrustedClientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.10' })),
  '203.0.113.10',
  'rightmost hop wins under trusted proxy',
)
assert.equal(
  resolveTrustedClientIp(req({ 'x-real-ip': '198.51.100.20', 'x-forwarded-for': '9.9.9.9' })),
  '198.51.100.20',
  'x-real-ip preferred over XFF',
)

const forwarded = buildForwardHeaders(
  req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.50', 'user-agent': 'test' }),
) as Record<string, string>
assert.equal(forwarded['X-Forwarded-For'], '203.0.113.50')
assert.equal(forwarded['X-Real-IP'], '203.0.113.50')
assert.notEqual(forwarded['X-Forwarded-For'], '1.1.1.1, 203.0.113.50')

console.log('resolveTrustedClientIp.test.ts: ok')
