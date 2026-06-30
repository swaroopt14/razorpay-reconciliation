'use client'

import { SettingsPageChrome } from '../../_components/SettingsPageChrome'
import { AccountSettingsClient } from './AccountSettingsClient'

export function AccountSettingsPageClient() {
  return (
    <SettingsPageChrome
      pageTitle="Account"
      pageSubtitle="Your profile and security settings."
    >
      <AccountSettingsClient />
    </SettingsPageChrome>
  )
}
