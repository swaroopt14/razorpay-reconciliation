import type { Metadata } from 'next'
import { AccountSettingsClient } from './_components/AccountSettingsClient'

export const metadata: Metadata = {
  title: 'Account | Zord',
  description: 'Manage your name, email, password, and team.',
}

export default function AccountSettingsPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0f172a]">Account</h1>
        <p className="mt-1 text-[16px] text-[#64748b]">Your profile and security settings.</p>
      </div>

      <AccountSettingsClient />
    </>
  )
}
