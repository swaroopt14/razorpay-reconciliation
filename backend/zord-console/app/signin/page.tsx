'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login, hydrateSession } from '@/services/auth'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout'
import {
  authInputClass,
  authLabelClass,
  authOutlineButtonClass,
  authPrimaryButtonClass,
} from '@/components/auth/authUiTokens'

function SignInFormFallback() {
  return (
    <AuthSplitLayout variant="signin" eyebrow="Welcome to Arealis Zord" title="Sign in" subtitle="Loading…">
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="h-11 rounded-lg bg-slate-200" />
      </div>
    </AuthSplitLayout>
  )
}

function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/payout-command-view/today'
  const sandboxDefault = params.get('sandbox') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openInSandbox, setOpenInSandbox] = useState(sandboxDefault)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login({
        workspaceId: '',
        email: email.trim().toLowerCase(),
        password,
        loginSurface: 'customer',
      })

      const user = await hydrateSession()
      if (!user) {
        setError('Signed in but session could not be restored. Refresh and try again.')
        setLoading(false)
        return
      }

      if (openInSandbox) {
        persistEnvMode('sandbox')
        router.push('/sandbox')
      } else {
        persistEnvMode('live')
        router.push(next)
      }
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in right now.'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      variant="signin"
      eyebrow="Welcome to Arealis Zord"
      title="Sign in to your workspace"
      subtitle="Use your work email and password. Live payout command opens after login."
      footer={
        <p className="text-center text-[12px] leading-relaxed text-slate-400">
          By continuing you agree to our{' '}
          <Link href="/terms" className="font-medium text-[#2B55E8] hover:underline">
            terms of use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-medium text-[#2B55E8] hover:underline">
            privacy policy
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="flex items-baseline justify-between">
            <span className={authLabelClass}>Password</span>
            <button type="button" className="text-[11px] font-medium text-slate-500 hover:text-slate-800">
              Forgot password?
            </button>
          </div>
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3.5 py-3">
          <input
            type="checkbox"
            checked={openInSandbox}
            onChange={(e) => setOpenInSandbox(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#2B55E8] focus:ring-[#2B55E8]"
          />
          <span className="text-[13px] leading-snug text-slate-600">
            <span className="font-semibold text-slate-900">Open in sandbox</span> — safe test workspace instead of live
            payout command.
          </span>
        </label>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? 'Signing in…' : 'Continue'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[12px] text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Link href="/signup" className={authOutlineButtonClass}>
        Book a demo
      </Link>
    </AuthSplitLayout>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFormFallback />}>
      <SignInForm />
    </Suspense>
  )
}
