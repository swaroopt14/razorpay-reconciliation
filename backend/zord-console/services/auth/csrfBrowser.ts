'use client'

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrfConstants'

function readBrowserCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key !== name) continue
    return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return ''
}

/** Headers for cookie-authenticated browser mutations (CON-P1-01). */
export function csrfMutationHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = readBrowserCookie(CSRF_COOKIE_NAME)
  const headers: Record<string, string> = { ...(extra || {}) }
  if (token) headers[CSRF_HEADER_NAME] = token
  return headers
}
