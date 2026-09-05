import { redirect } from 'next/navigation'
import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from '@/services/payout-command/batchCommandCenterHref'

/**
 * Spec 7.4 route `/payouts/new` - Create Payout Obligation.
 * Implemented on Batch Command Center (Upload / Single / API tabs).
 */
export default function CreatePayoutObligationRoutePage() {
  redirect(`${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?demo=sandbox&upload=1`)
}
