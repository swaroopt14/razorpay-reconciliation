'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { login, logout } from '@/services/auth'
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout'
import {
  authInputClass,
  authLabelClass,
  authOutlineButtonClass,
  authPrimaryButtonClass,
} from '@/components/auth/authUiTokens'

/**
 * Ops entry — same light AuthSplitLayout as /signin and /admin/login.
 */
export default function OpsLoginPage() {
  const router = useRouter()

  const [workspaceId, setWorkspaceId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const tenant = workspaceId.trim()
    if (!tenant) {
      setError('Workspace / tenant id is required.')
      return
    }

    setLoading(true)
    try {
      const envelope = await login({
        workspaceId: tenant,
        email: email.trim().toLowerCase(),
        password,
        loginSurface: 'ops',
      })

      if (envelope.user.role !== 'OPS') {
        await logout()
        setError('This entry is for operations staff only. Use an ops account.')
        setLoading(false)
        return
      }

      router.push('/ops/intents')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in right now.'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      variant="ops"
      eyebrow="Operations access"
      title="Sign in to Ops"
      subtitle="Monitor queues, replay failed flows, and keep ingress health under control."
      footer={
        <p className="text-center text-[12px] leading-relaxed text-slate-400">
          Looking for the customer workspace?{' '}
          <Link href="/signin" className="font-medium text-[#2B55E8] hover:underline">
            Sign in here
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={authLabelClass}>Workspace / tenant id</span>
          <input
            type="text"
            required
            autoComplete="organization"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className={authInputClass}
            placeholder="Enter workspace or tenant id"
          />
        </label>

        <label className="block">
          <span className={authLabelClass}>Work email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            placeholder="Enter your email"
          />
        </label>

        <label className="block">
          <span className={authLabelClass}>Password</span>
          <div className="relative mt-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authInputClass} mt-0 pr-16`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {error ? (
          <div className="rounded-lg border border-[#0B1324]/20 bg-[#F1F5F9] px-3.5 py-2.5 text-[13px] text-[#0B1324]">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? 'Signing in…' : 'Continue to Ops'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[12px] text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Link href="/signin" className={authOutlineButtonClass}>
        Customer sign in
      </Link>
      <Link href="/admin/login" className={`${authOutlineButtonClass} mt-2`}>
        Admin sign in
      </Link>
    </AuthSplitLayout>
  )
}
