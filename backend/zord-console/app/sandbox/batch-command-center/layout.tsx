import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sandbox · Batch Command Center | Zord',
  description:
    'Upload payout sheets and settlement files in sandbox mode. Stays under /sandbox so navigation returns to the sandbox Intent Journal and command shell.',
}

export default function SandboxBatchCommandCenterLayout({ children }: { children: React.ReactNode }) {
  return children
}
