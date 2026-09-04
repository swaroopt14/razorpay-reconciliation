/**
 * Demo cryptographic profile v1: RFC 8785 JCS + SHA-256 + detached JWS ES256.
 * Digests and signatures are computed from stable demo bytes and a real demo key.
 */
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto'

export const DEMO_KID = 'zord-demo-es256-2026'
export const DEMO_ALG = 'ES256'

/** Stable P-256 demo key. Public material may be shown; private never leaves smoke. */
export const DEMO_PRIVATE_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'oBkWPnmPI3k3sVoALbaLmSwyI3fSN3BTkXohOyNAXCA',
  y: '6m71iE8TvC8COxapFT2ErT5LvPZvDvu_QfMRUZ5aiPU',
  d: '8ei5gFp015tZw4ka_lqkVkhn4kUeWg2Aepe4S7tdPYo',
}

export const DEMO_PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'oBkWPnmPI3k3sVoALbaLmSwyI3fSN3BTkXohOyNAXCA',
  y: '6m71iE8TvC8COxapFT2ErT5LvPZvDvu_QfMRUZ5aiPU',
}

const privateKey = createPrivateKey({ key: DEMO_PRIVATE_JWK, format: 'jwk' })
const publicKey = createPublicKey({ key: DEMO_PUBLIC_JWK, format: 'jwk' })

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** RFC 8785 JSON Canonicalization Scheme (JCS). */
export function canonicalize(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('jcs_non_finite_number')
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  throw new Error('jcs_unsupported_type')
}

export function sha256Hex(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return createHash('sha256').update(buf).digest('hex')
}

export function digestObject(object) {
  const canonical = canonicalize(object)
  return {
    canonicalization: 'RFC8785',
    digest_alg: 'sha-256',
    digest: `sha256:${sha256Hex(canonical)}`,
    canonical,
  }
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  return Buffer.from(padded, 'base64')
}

export function signBytes(payloadUtf8) {
  const header = { alg: DEMO_ALG, kid: DEMO_KID, typ: 'JOSE', b64: true }
  const headerPart = b64url(Buffer.from(JSON.stringify(header), 'utf8'))
  const payloadPart = b64url(Buffer.from(payloadUtf8, 'utf8'))
  const signingInput = `${headerPart}.${payloadPart}`
  const der = nodeSign('SHA256', Buffer.from(signingInput, 'utf8'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  const signaturePart = b64url(der)
  return {
    format: 'JWS',
    alg: DEMO_ALG,
    kid: DEMO_KID,
    value: `${headerPart}.${payloadPart}.${signaturePart}`,
    detached: `${headerPart}..${signaturePart}`,
  }
}

export function verifyJws(jws, expectedPayload) {
  try {
    const parts = String(jws || '').split('.')
    if (parts.length !== 3) return { ok: false, error: 'jws_malformed' }
    const [headerPart, payloadPart, signaturePart] = parts
    const header = JSON.parse(fromB64url(headerPart).toString('utf8'))
    if (header.alg !== DEMO_ALG) return { ok: false, error: 'alg_not_allowed' }
    if (header.kid && header.kid !== DEMO_KID) return { ok: false, error: 'kid_unknown' }
    const payload = fromB64url(payloadPart).toString('utf8')
    if (expectedPayload != null && payload !== expectedPayload) {
      return { ok: false, error: 'payload_mismatch' }
    }
    const signingInput = `${headerPart}.${payloadPart}`
    const ok = nodeVerify(
      'SHA256',
      Buffer.from(signingInput, 'utf8'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      fromB64url(signaturePart),
    )
    return ok ? { ok: true, header, payload } : { ok: false, error: 'signature_invalid' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'verify_failed' }
  }
}

export function sealObject(object) {
  const withoutSig = { ...object }
  delete withoutSig.signature
  delete withoutSig.digest
  withoutSig.canonicalization = withoutSig.canonicalization || 'RFC8785'
  withoutSig.digest_alg = withoutSig.digest_alg || 'sha-256'
  const { digest, canonical } = digestObject(withoutSig)
  const signature = signBytes(digest)
  return {
    object: {
      ...withoutSig,
      digest,
      signature,
    },
    canonical,
    digest,
  }
}

export function verifySealedObject(object) {
  if (!object || typeof object !== 'object') {
    return { result: 'INVALID', error: 'missing_object' }
  }
  const clone = { ...object }
  const signature = clone.signature
  const storedDigest = clone.digest
  delete clone.signature
  delete clone.digest
  const recomputed = digestObject(clone)
  if (storedDigest !== recomputed.digest) {
    return {
      result: 'INVALID',
      error: 'digest_mismatch',
      stored_digest: storedDigest,
      computed_digest: recomputed.digest,
    }
  }
  const jws = signature?.value
  const sigCheck = verifyJws(jws, storedDigest)
  if (!sigCheck.ok) {
    return {
      result: 'INVALID',
      error: sigCheck.error,
      stored_digest: storedDigest,
      computed_digest: recomputed.digest,
    }
  }
  return {
    result: 'VALID',
    stored_digest: storedDigest,
    computed_digest: recomputed.digest,
    kid: signature?.kid ?? DEMO_KID,
    alg: signature?.alg ?? DEMO_ALG,
  }
}

export function merkleRootFromDigests(digests) {
  let level = digests.map((hex) => Buffer.from(String(hex).replace(/^sha256:/, ''), 'hex'))
  if (level.length === 0) return `sha256:${sha256Hex('')}`
  const layers = [level.map((b) => b.toString('hex'))]
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = level[i + 1] ?? left
      next.push(Buffer.from(sha256Hex(Buffer.concat([left, right])), 'hex'))
    }
    level = next
    layers.push(level.map((b) => b.toString('hex')))
  }
  return {
    merkle_root: `sha256:${level[0].toString('hex')}`,
    leaf_count: digests.length,
    layers,
  }
}

export function jwks() {
  return {
    keys: [
      {
        ...DEMO_PUBLIC_JWK,
        kid: DEMO_KID,
        alg: DEMO_ALG,
        use: 'sig',
      },
    ],
  }
}
