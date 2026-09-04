import { redirect } from 'next/navigation'
import { legacyPayoutCommandRedirect } from '@/services/payout-command/canonicalDockPath'

export default function PayoutCommandViewTodayPage({
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
