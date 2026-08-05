'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PlatformHealthRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/console/dashboards/platform-health')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600"></div>
        <p className="mt-3 text-sm text-gray-500">Redirecting...</p>
      </div>
    </div>
  )
}
