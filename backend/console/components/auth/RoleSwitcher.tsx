'use client'

// The old mock role switcher is intentionally disabled now that auth is backed by real tenant-scoped sessions.
// Keeping the component around as a no-op avoids breaking pages that still import it.

export function RoleSwitcher() {
  return null
}
