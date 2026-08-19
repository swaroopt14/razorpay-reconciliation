/**
 * Intelligence BFF must forward session JWT upstream.
 * Run: node --experimental-strip-types services/auth/intelligenceBearer.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

{
  const resolveSrc = readFileSync(join(__dirname, 'resolvePayoutTenant.server.ts'), 'utf8')
  assert.match(resolveSrc, /accessToken/, 'session gate must surface accessToken')
  assert.match(resolveSrc, /sessionUpstreamHeaders/, 'shared upstream auth headers helper')
  assert.match(resolveSrc, /Authorization: `Bearer \$\{accessToken\}`/, 'Bearer header builder')
}

{
  const intelSrc = readFileSync(
    join(__dirname, '../../app/api/prod/intelligence/_shared.ts'),
    'utf8',
  )
  assert.match(intelSrc, /sessionUpstreamHeaders/, 'intelligence BFF must attach session JWT')
  assert.match(intelSrc, /gate\.accessToken/, 'intelligence BFF must read accessToken from gate')
}

console.log('intelligenceBearer.contract.test.ts: OK')
