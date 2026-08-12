/**
 * CON-P1-02 — baseline browser security headers for Zord Console.
 *
 * HSTS is intentionally not set here (breaks local HTTP). Kong/ingress already
 * adds Strict-Transport-Security on the public edge.
 *
 * connect-src stays same-origin so the browser only talks to Next BFF `/api/*`.
 */

/** @returns {string} */
function buildContentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    // Next.js App Router emits inline bootstrapping scripts; keep eval off in prod CSP.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  // Avoid breaking local HTTP (`npm run dev`); Kong/prod CSP can tighten further.
  if (process.env.NODE_ENV === 'production') {
    directives.push('upgrade-insecure-requests')
  }
  return directives.join('; ')
}

/** @returns {{ key: string, value: string }[]} */
function baselineSecurityHeaders() {
  return [
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy(),
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      value:
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    },
    {
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin',
    },
    {
      key: 'Cross-Origin-Resource-Policy',
      value: 'same-origin',
    },
  ]
}

module.exports = {
  buildContentSecurityPolicy,
  baselineSecurityHeaders,
}
