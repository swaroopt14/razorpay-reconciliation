import { redirect } from 'next/navigation'
import { legacyPayoutCommandRedirect } from '@/services/payout-command/canonicalDockPath'

/**
 * Legacy sandbox dock shell. India console pages are canonical
 * (`/overview`, `/transactions`, …). Query `dock=` still maps across.
 */
export default function SandboxPage({
  searchParams,
}: {
  searchParams: {
    dock?: string | string[]
    batch_id?: string | string[]
    client_batch_id?: string | string[]
  }
}) {
  redirect(legacyPayoutCommandRedirect(searchParams))
}
