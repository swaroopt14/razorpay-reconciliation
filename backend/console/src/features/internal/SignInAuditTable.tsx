'use client'

export type SignInAuditRow = {
  id: string
  email: string
  company_name?: string | null
  workspace_id?: string | null
  login_surface?: string | null
  mode?: string | null
  success?: boolean
  ip?: string | null
  user_agent?: string | null
  latency_ms?: number | null
  logged_in_at: string
}

export type SignInAuditPayload = {
  ok?: boolean
  live?: boolean
  source?: string
  count?: number
  items?: SignInAuditRow[]
  status?: { backend?: string; database_configured?: boolean }
  fetched_at?: string
  error?: string
  message?: string
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function shortAgent(value: string | null | undefined) {
  if (!value) return '—'
  if (value.length <= 72) return value
  return `${value.slice(0, 72)}…`
}

export function SignInAuditTable({
  rows,
  loading,
  error,
  backend,
  source,
  fetchedAt,
  onRefresh,
  exportRows,
}: {
  rows: SignInAuditRow[]
  loading?: boolean
  error?: string | null
  backend?: string
  source?: string
  fetchedAt?: string
  onRefresh?: () => void
  exportRows?: () => void
}) {
  const store = backend || source || 'unknown'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          <span className="mr-2 inline-flex items-center rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#0B1324] ring-1 ring-[#0B1324]/15">
            Live API
          </span>
          Store:{' '}
          <span className="font-semibold text-[#0B1324]">{store}</span>
          {store === 'memory' ? ' · lost on restart' : null}
          {store === 'postgres' ? ' · persisted' : null}
          {' · '}
          {rows.length} sign-in{rows.length === 1 ? '' : 's'}
          {fetchedAt ? ` · fetched ${formatWhen(fetchedAt)}` : null}
        </p>
        <div className="flex gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center border border-[#D8DEE9] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              Refresh
            </button>
          ) : null}
          {exportRows ? (
            <button
              type="button"
              onClick={exportRows}
              className="inline-flex h-9 items-center border border-[#D8DEE9] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              Export
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="border-l-4 border-[#C2413B] bg-white px-4 py-3 text-[13px] text-[#C2413B]">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-[#64748B]">Loading live sign-ins…</p>
      ) : rows.length === 0 && !error ? (
        <p className="border border-[#D8DEE9] bg-white px-5 py-8 text-[13px] text-[#64748B]">
          No sign-ins recorded yet. Use Start the demo or Sign in, then refresh.
        </p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto border border-[#D8DEE9] bg-white">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#FAFBFC]">
                {['Signed in at', 'Company', 'Email', 'Surface', 'Mode', 'IP', 'Latency', 'Browser'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.email}-${row.logged_in_at}`} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="px-4 py-3 tabular-nums text-[#0B1324]" title={row.logged_in_at}>
                    {formatWhen(row.logged_in_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0B1324]">{row.company_name || '—'}</td>
                  <td className="px-4 py-3 font-medium text-[#0B1324]">{row.email}</td>
                  <td className="px-4 py-3 text-[#475569]">{row.login_surface || '—'}</td>
                  <td className="px-4 py-3 text-[#475569]">{row.mode || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#475569]">{row.ip || '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-[#475569]">
                    {row.latency_ms != null ? `${row.latency_ms} ms` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#64748B]" title={row.user_agent || ''}>
                    {shortAgent(row.user_agent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
