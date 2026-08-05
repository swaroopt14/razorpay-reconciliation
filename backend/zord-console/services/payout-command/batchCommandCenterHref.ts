/** Single source for batch center paths — imported by UI without pulling in all of `model.ts`. */
export const PAYOUT_BATCH_COMMAND_CENTER_LIVE_PATH = '/payout-command-view/batch-command-center' as const
export const PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH = '/sandbox/batch-command-center' as const

export function payoutBatchCommandCenterHref(isSandbox: boolean): string {
  return isSandbox ? PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH : PAYOUT_BATCH_COMMAND_CENTER_LIVE_PATH
}
