import type { Metadata } from 'next'
import { ApiKeysClient } from './_components/ApiKeysClient'

export const metadata: Metadata = {
  title: 'API keys | Zord',
  description: 'Manage your sandbox and live publishable + secret keys.',
}

export default function ApiKeysPage() {
  return <ApiKeysClient />
}
