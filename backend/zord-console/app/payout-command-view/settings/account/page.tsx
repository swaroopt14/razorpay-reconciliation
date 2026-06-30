import type { Metadata } from 'next'
import { AccountSettingsPageClient } from './_components/AccountSettingsPageClient'

export const metadata: Metadata = {
  title: 'Account | Zord',
  description: 'Manage your name, email, password, and team.',
}

export default function AccountSettingsPage() {
  return <AccountSettingsPageClient />
}
