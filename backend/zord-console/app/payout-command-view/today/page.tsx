import type { Metadata } from 'next'
import { resolveInitialDock } from './_lib/resolveInitialDock'
import PayoutCommandViewClient, {
  type PayoutCommandScope,
} from '@/features/payout-command/shell/PayoutCommandViewClient'

export const metadata: Metadata = {
  title: 'Payout Command View | Zord',
  description: 'Route posture, owner handoff, and proof readiness in one operating workspace.',
}

// Live-mode entry. Sandbox lives at /sandbox.
function readBatchIdParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const tid = v?.trim()
  return tid || undefined
}

export default function PayoutCommandViewTodayPage({
  searchParams,
}: {
  searchParams: {
    dock?: string | string[]
    batch_id?: string | string[]
    client_batch_id?: string | string[]
    accountTab?: string | string[]
  }
}) {
  const scope: PayoutCommandScope = {
    batchId: readBatchIdParam(searchParams.batch_id),
    clientBatchId: readBatchIdParam(searchParams.client_batch_id),
    accountTab: readBatchIdParam(searchParams.accountTab),
  }

  return (
    <PayoutCommandViewClient
      forceMode="live"
      initialDock={resolveInitialDock(searchParams.dock)}
      scope={scope}
    />
  )
}
