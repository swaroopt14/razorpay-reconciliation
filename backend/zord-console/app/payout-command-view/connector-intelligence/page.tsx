import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
// import { ConnectorIntelligencePageClient } from './_components/ConnectorIntelligencePageClient'

export const metadata: Metadata = {
  title: 'Connector Performance & Leakage | Zord',
  description:
    'Connector performance, leakage exposure, and recommended actions across connected PSPs, banks, and rails.',
}

/** Connectors route temporarily disabled — code kept under ./_components. */
export default function ConnectorIntelligencePage() {
  redirect('/payout-command-view/today')
  // return <ConnectorIntelligencePageClient />
}
