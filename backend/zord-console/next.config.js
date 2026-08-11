/** @type {import('next').NextConfig} */
const path = require('path')
const { baselineSecurityHeaders } = require('./security-headers')

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // CON-P1-02: do not advertise Next.js via X-Powered-By.
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Increase image optimization timeout and cache for production
  images: {
    minimumCacheTTL: 3600,
    formats: ['image/webp'],
  },
  // Server fetch cache: opt out per-request via `cache: 'no-store'` on fetches and
  // `Cache-Control` on Route Handlers — there is no global "disable all fetch cache" flag here.
  experimental: {
    // Prevents "Failed to find Server Action" errors after redeployment
    // by allowing graceful fallback for stale client requests
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Auth-guarded HTML must not be stored by shared CDNs (stale shell / wrong session after deploy).
  // CON-P1-02: CSP + baseline browser security headers on all responses.
  // HSTS remains at Kong/ingress (see kubernetes/api-gateway/kong/configmap.yaml).
  async headers() {
    const securityHeaders = baselineSecurityHeaders()
    const privateHtml = [
      '/sandbox',
      '/sandbox/:path*',
      '/payout-command-view',
      '/payout-command-view/:path*',
    ]
    const cacheHeaders = [
      { key: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate' },
      { key: 'Vary', value: 'Cookie' },
    ]
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      ...privateHtml.map((source) => ({ source, headers: cacheHeaders })),
    ]
  },
  // Mutate resolve.alias in place — replacing the whole object can drop Next.js
  // internal aliases and cause "Cannot find the middleware module" at runtime.
  webpack: (config) => {
    const alias = config.resolve.alias ?? {}
    config.resolve.alias = alias
    alias['@/constants'] = path.resolve(__dirname, 'constants')
    alias['@/components'] = path.resolve(__dirname, 'components')
    alias['@/features'] = path.resolve(__dirname, 'src/features')
    alias['@/shared'] = path.resolve(__dirname, 'src/shared')
    alias['@/server'] = path.resolve(__dirname, 'src/server')
    alias['@/styles'] = path.resolve(__dirname, 'src/styles')
    alias['@/lib'] = path.resolve(__dirname, 'src/shared/lib')
    alias['@/types'] = path.resolve(__dirname, 'types')
    alias['@/utils'] = path.resolve(__dirname, 'utils')
    alias['@/services'] = path.resolve(__dirname, 'services')
    alias['@/config'] = path.resolve(__dirname, 'config')
    return config
  },
}

module.exports = nextConfig
