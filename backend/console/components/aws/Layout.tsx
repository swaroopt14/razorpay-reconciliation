'use client'

import { ReactNode, useState, useEffect } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { OpsSidebar } from './OpsSidebar'
import { getCurrentUser } from '@/services/auth'
import { EnvironmentProvider, useEnvironment } from './EnvironmentContext'

interface LayoutProps {
  children: ReactNode
  serviceName?: string
  breadcrumbs?: string[]
  tenant?: string
}

function LayoutContent({ children, serviceName = '', breadcrumbs, tenant }: LayoutProps) {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null)
  const envContext = useEnvironment()

  useEffect(() => {
    setMounted(true)
    setUser(getCurrentUser())
  }, [])

  const currentTenant = tenant || user?.tenant
  
  // Sidebar only appears when inside a service (serviceName is provided and not empty)
  const showSidebar = serviceName && serviceName !== ''
  
  // Use OpsSidebar for "Ops Ingestion", regular Sidebar for "Ingestion" or other services
  const isOpsService = serviceName === 'Ops Ingestion'

  return (
    <div className="min-h-screen" style={{ background: 'var(--zord-page-bg)' }}>
      <TopBar 
        tenant={currentTenant}
        serviceName={serviceName}
        breadcrumbs={breadcrumbs}
        environment={envContext.environment}
        onEnvironmentChange={envContext.setEnvironment}
      />
      <div className="flex" style={{ height: 'calc(100vh - 2.5rem)' }}>
        {showSidebar && (
          isOpsService ? <OpsSidebar /> : <Sidebar serviceName={serviceName} />
        )}
        <main className={`${showSidebar ? 'flex-1' : 'w-full'} overflow-y-auto`} style={{ background: 'var(--zord-page-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

export function Layout(props: LayoutProps) {
  return (
    <EnvironmentProvider>
      <LayoutContent {...props} />
    </EnvironmentProvider>
  )
}
