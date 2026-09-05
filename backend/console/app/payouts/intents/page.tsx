import { redirect } from 'next/navigation'
import { legacyPayoutCommandRedirect } from '@/services/payout-command/canonicalDockPath'

export default function PayoutsIntentsRoutePage({
  searchParams,
}: {
  searchParams: {
    batch_id?: string | string[]
    client_batch_id?: string | string[]
  }
}) {
  redirect(legacyPayoutCommandRedirect({ dock: 'grid', ...searchParams }))
}
