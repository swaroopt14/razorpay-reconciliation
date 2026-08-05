import dynamic from 'next/dynamic'
import type { Metadata } from 'next'
import { resolveInitialDock } from '@/app/payout-command-view/today/_lib/resolveInitialDock'
import { SANDBOX_DOCK_IDS } from '@/services/payout-command/model'

export const metadata: Metadata = {
  title: 'Sandbox · Zord',
  description: 'Test the full Intent Journal flow without touching real funds.',
}

const PayoutCommandViewClient = dynamic(
  () => import('@/features/payout-command/shell/PayoutCommandViewClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 bg-[#fafafa] text-[15px] text-slate-600">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"
          aria-hidden
        />
        <span>Loading sandbox…</span>
      </div>
    ),
  },
)

/**
 * /sandbox — sandbox mode. Same Home command center layout as live (`/payout-command-view/today`),
 * plus the sandbox banner and mode toggle. API keys and batch flows use the header and other docks.
 *
 * The heavy client tree is loaded with `next/dynamic` so the route chunk stays small — reduces
 * dev-time ChunkLoadError (timeouts) when the main bundle is large. If you still see stale chunks
 * after `next dev` restarts, hard-refresh or run `rm -rf .next` once.
 */
function readQueryParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const tid = v?.trim()
  return tid || undefined
}

export default function SandboxPage({
  searchParams,
}: {
  searchParams: {
    dock?: string | string[]
    batch_id?: string | string[]
    client_batch_id?: string | string[]
  }
}) {
  return (
    <PayoutCommandViewClient
      forceMode="sandbox"
      initialDock={resolveInitialDock(searchParams.dock, SANDBOX_DOCK_IDS)}
      scope={{
        batchId: readQueryParam(searchParams.batch_id),
        clientBatchId: readQueryParam(searchParams.client_batch_id),
      }}
    />
  )
}
