import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'

/**
 * CON-P1-06 — normalized public BFF error body.
 * Never include upstream hosts, internal DNS, or raw exception messages.
 */
export type PublicBffErrorBody = {
  code: string
  message: string
  trace_id: string
}

export type PublicBffErrorLog = {
  route: string
  upstream?: string
  error?: unknown
  extra?: Record<string, unknown>
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown'
}

/**
 * Log upstream/internal detail server-side; return only `{code,message,trace_id}` to the client.
 */
export function publicBffError(options: {
  code: string
  message: string
  status?: number
  log?: PublicBffErrorLog
}): NextResponse {
  const traceId = randomUUID()
  const status = options.status ?? 502

  if (options.log) {
    console.error('[zord-bff]', {
      trace_id: traceId,
      code: options.code,
      route: options.log.route,
      upstream: options.log.upstream,
      error: errorText(options.log.error),
      ...(options.log.extra ?? {}),
    })
  }

  const body: PublicBffErrorBody = {
    code: options.code,
    message: options.message,
    trace_id: traceId,
  }

  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-trace-id': traceId,
    },
  })
}
