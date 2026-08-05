'use client'

import { ReactNode, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { TopBar } from '@/components/aws'
import { EnvironmentProvider, useEnvironment } from '@/components/aws'
import { getCurrentUser } from '@/services/auth'
import { OpsSidebar } from './components/OpsSidebar'

interface OpsLayoutProps {
  children: ReactNode
}

function OpsLayoutContent({ children }: OpsLayoutProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null)
  const envContext = useEnvironment()

  useEffect(() => {
    setMounted(true)
    setUser(getCurrentUser())
  }, [])

  const isLoginPage = pathname === '/ops/login'
  if (isLoginPage) return <>{children}</>

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        tenant={user?.tenant}
        serviceName="Ops"
        breadcrumbs={['Ops']}
        environment={envContext.environment}
        onEnvironmentChange={envContext.setEnvironment}
      />
      <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
        <OpsSidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  )
}

export default function OpsLayout({ children }: OpsLayoutProps) {
  return (
    <EnvironmentProvider>
      <OpsLayoutContent>{children}</OpsLayoutContent>
    </EnvironmentProvider>
  )
}
