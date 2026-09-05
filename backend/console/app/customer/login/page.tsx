'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function CustomerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [role, setRole] = useState('operator')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    // Mock auth
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('zord_auth', JSON.stringify({
          id: 'usr_001',
          email,
          role: role === 'operator' ? 'CUSTOMER_USER' : role === 'supervisor' ? 'CUSTOMER_ADMIN' : 'CUSTOMER_USER',
          tenant: tenantId || 'acme-corp',
          name: email.split('@')[0],
        }))
        localStorage.setItem('zord_current_role', role === 'operator' ? 'CUSTOMER_USER' : role === 'supervisor' ? 'CUSTOMER_ADMIN' : 'CUSTOMER_USER')
      }
      router.push('/customer/overview')
      setIsLoading(false)
    }, 800)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-gradient-to-br from-[#1F2937] via-[#2D1B69] to-[#4C1D95] overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-cx-purple-400 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-cx-orange-400 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cx-teal-400 rounded-full blur-3xl" />
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative z-10 flex flex-col justify-between w-full p-12">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <span className="text-white font-black text-lg">Z</span>
              </div>
              <div>
                <h1 className="text-white text-xl font-bold tracking-tight">ZORD</h1>
                <p className="text-white/50 text-[10px] font-medium tracking-[0.3em]">CUSTOMER OPS</p>
              </div>
            </div>
          </div>

          {/* Hero Text */}
          <div className="space-y-6">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Real-time<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cx-purple-300 to-cx-teal-300">
                Payment Operations
              </span>
              <br />at Your Fingertips.
            </h2>
            <p className="text-white/60 text-base leading-relaxed max-w-md">
              Full-stack intent visibility, evidence packs, settlement reconciliation,
              and SLA monitoring - all in one tenant-scoped console.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-2 pt-2">
              {['Intent Journal', 'Evidence Explorer', 'SLA Monitoring', 'Recon Dashboard'].map((f) => (
                <span key={f} className="px-3 py-1.5 text-xs font-medium text-white/80 bg-white/10 backdrop-blur-sm rounded-full border border-white/10">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom Stats */}
          <div className="flex gap-8">
            {[
              { value: '99.97%', label: 'Uptime SLA' },
              { value: '<200ms', label: 'Ack Latency' },
              { value: 'RBI/SAMA', label: 'Compliant' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold text-white tabular-nums">{stat.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-cx-bg p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-cx-purple-600 flex items-center justify-center">
              <span className="text-white font-black text-lg">Z</span>
            </div>
            <div>
              <h1 className="text-cx-text text-xl font-bold">ZORD</h1>
              <p className="text-cx-neutral text-[10px] tracking-[0.3em]">CUSTOMER OPS</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-cx-text">Sign in to Console</h2>
            <p className="text-sm text-cx-neutral mt-1">Access your tenant&apos;s operations dashboard</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tenant ID */}
            <div>
              <label className="block text-sm font-medium text-cx-text mb-1.5">Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="e.g. acme-pay"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-cx-text placeholder-gray-400 focus:ring-2 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none transition-all"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-cx-text mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-cx-text placeholder-gray-400 focus:ring-2 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none transition-all"
                required
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-cx-text">Password</label>
                <button type="button" className="text-xs text-cx-purple-600 hover:text-cx-purple-700 font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 bg-white border border-gray-200 rounded-lg text-sm text-cx-text placeholder-gray-400 focus:ring-2 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cx-text"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Role Selector */}
            <div>
              <label className="block text-sm font-medium text-cx-text mb-1.5">Role Profile</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'operator', label: 'Operator', desc: 'Read + actions' },
                  { value: 'supervisor', label: 'Supervisor', desc: 'Replay + approve' },
                  { value: 'auditor', label: 'Auditor', desc: 'Read-only' },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`p-2.5 rounded-lg border text-center transition-all ${
                      role === r.value
                        ? 'border-cx-purple-500 bg-cx-purple-50 ring-1 ring-cx-purple-500'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className={`text-xs font-semibold ${role === r.value ? 'text-cx-purple-700' : 'text-cx-text'}`}>{r.label}</p>
                    <p className="text-[10px] text-cx-neutral mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-cx-purple-600 hover:bg-cx-purple-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-cx-purple-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Signing in...
                </span>
              ) : 'Sign in to Console'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-cx-neutral text-center">
              Secured by Zord Identity. All sessions are logged and auditable.
            </p>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-cx-neutral">
              <span>SOC 2 Type II</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>RBI Compliant</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>SAMA Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
