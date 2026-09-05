'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CustomerTopBar } from './components/CustomerTopBar'
import { CustomerSidebar } from './components/CustomerSidebar'
import { FloatingCopilotButton } from './components/copilot'

interface CustomerLayoutProps {
  children: ReactNode
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const pathname = usePathname()
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('production')
  const [tenantName, setTenantName] = useState<string>('AcmePay')

  useEffect(() => {
    const t = localStorage.getItem('cx_tenant_name')
    if (t) setTenantName(t)
    const env = localStorage.getItem('cx_env')
    if (env === 'sandbox' || env === 'production') setEnvironment(env)
  }, [])

  useEffect(() => {
    if (!pathname?.startsWith('/customer')) return
    const nextEnv: 'sandbox' | 'production' = pathname.startsWith('/customer/sandbox') ? 'sandbox' : 'production'
    setEnvironment(nextEnv)
    localStorage.setItem('cx_env', nextEnv)
  }, [pathname])

  const handleEnvChange = (env: 'sandbox' | 'production') => {
    setEnvironment(env)
    localStorage.setItem('cx_env', env)
  }

  // Login page gets its own full-screen layout
  const isLoginPage = pathname === '/customer/login'
  if (isLoginPage) return <>{children}</>

  return (
    <>
      {/* Customer theme tokens (scoped to the customer route segment). */}
      <style jsx global>{`
        :root {
          --primary: #7c3aed;
          --energy: #f97316;
          --success: #14b8a6;
          --bg: #fafafa;
          --text: #1f2937;

          /* Bridge variables used by customer UI components */
          --cx-primary: var(--primary);
          --cx-energy: var(--energy);
          --cx-success: var(--success);

          --glass-surface: rgba(255, 255, 255, 0.72);
          --glass-panel: rgba(255, 255, 255, 0.86);
          --glass-border: rgba(31, 41, 55, 0.10);
          --glass-blur: 14px;
          --glass-saturation: 130%;
          --glass-shadow-sm: 0 6px 20px rgba(31, 41, 55, 0.08);
          --glass-shadow: 0 14px 34px rgba(31, 41, 55, 0.10);
          --glass-bg-start: rgba(255, 255, 255, 0.85);

          /* Card elevation (customer pages use many "bg-white rounded-xl border" cards). */
          --cx-card-shadow: 0 18px 42px rgba(31, 41, 55, 0.10);
          --cx-card-shadow-hover: 0 22px 54px rgba(31, 41, 55, 0.14);

          --glass-item-active: var(--text);
          --glass-item-text: rgba(31, 41, 55, 0.7);
          --glass-item-hover-bg: rgba(31, 41, 55, 0.06);
          --glass-item-hover: rgba(31, 41, 55, 0.92);
          --glass-item-disabled: rgba(31, 41, 55, 0.45);

          --glass-badge-bg: rgba(31, 41, 55, 0.08);
          --glass-badge-text: rgba(31, 41, 55, 0.78);
        }

        html[data-theme='dark'] {
          --bg: #0b1220;
          --text: #e5e7eb;

          --glass-surface: rgba(17, 24, 39, 0.72);
          --glass-panel: rgba(17, 24, 39, 0.86);
          --glass-border: rgba(229, 231, 235, 0.10);
          --glass-shadow-sm: 0 10px 24px rgba(0, 0, 0, 0.35);
          --glass-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
          --glass-bg-start: rgba(17, 24, 39, 0.95);

          --cx-card-shadow: 0 22px 60px rgba(0, 0, 0, 0.50);
          --cx-card-shadow-hover: 0 26px 76px rgba(0, 0, 0, 0.58);

          --glass-item-active: var(--text);
          --glass-item-text: rgba(229, 231, 235, 0.72);
          --glass-item-hover-bg: rgba(229, 231, 235, 0.08);
          --glass-item-hover: rgba(229, 231, 235, 0.92);
          --glass-item-disabled: rgba(229, 231, 235, 0.46);

          --glass-badge-bg: rgba(229, 231, 235, 0.12);
          --glass-badge-text: rgba(229, 231, 235, 0.78);
        }
      `}</style>

      <div className="cx-glass-bg min-h-screen">
      <CustomerTopBar
        tenant={tenantName}
        environment={environment}
        onEnvironmentChange={handleEnvChange}
      />
      <div className="flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <CustomerSidebar />
        <main className="flex-1 overflow-y-auto cx-glass-scroll">
          {children}
        </main>
      </div>
      <FloatingCopilotButton />
      </div>
    </>
  )
}
