import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { AuthSessionBootstrap } from '@/components/auth/AuthSessionBootstrap'
import { SessionManager } from '@/components/auth/SessionManager'

export const metadata: Metadata = {
  title: 'Zord Ingestion Console',
  description: 'Ingestion management and evidence tracking',
  icons: {
    icon: '/icon.svg',
    shortcut: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Some browser extensions inject attributes into <html>/<body> which causes
    // React hydration warnings in dev (e.g. data-liner-extension-version).
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Suspense fallback={null}>
          <AuthSessionBootstrap />
        </Suspense>
        <SessionManager />
        {children}
      </body>
    </html>
  )
}
