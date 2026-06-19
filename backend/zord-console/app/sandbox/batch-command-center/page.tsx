import type { Metadata } from 'next'
import { BatchCommandCenterShell } from '@/features/payout-command/batch-command-center/_components/BatchCommandCenterShell'

export const metadata: Metadata = {
  title: 'Sandbox · Batch Command Center | Zord',
  description: 'Test batch disbursement intake and settlement flows in sandbox mode.',
}

/**
 * `/sandbox/batch-command-center` — same shell as `/sandbox` (strip + DockNav) with batch body.
 */
export default function SandboxBatchCommandCenterPage() {
  return <BatchCommandCenterShell forceMode="sandbox" />
}
