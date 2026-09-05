'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login, hydrateSession } from '@/services/auth'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { clearDemoIngestState } from '@/services/payout-command/demo/demoBatchReadiness'
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout'
import {
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from '@/components/auth/authUiTokens'

function SignInFormFallback() {
  return (
    <AuthSplitLayout variant="signin" eyebrow="Welcome to Arealis Zord" title="Sign in" subtitle="Loading…">
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded-lg bg-slate-100" />
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
  const next = params.get('next') || '/overview'
  const sandboxDefault = params.get('sandbox') === '1'

  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openInSandbox, setOpenInSandbox] = useState(sandboxDefault)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (companyName.trim().length < 2) {
      setError('Company name is required.')
      return
    }
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      await login({
        workspaceId: '',
        email: email.trim().toLowerCase(),
        password,
        companyName: companyName.trim(),
        loginSurface: 'customer',
      })

      const user = await hydrateSession()
      if (!user) {
        setError('Signed in but session could not be restored. Refresh and try again.')
        setLoading(false)
        return
      }

      clearDemoIngestState()

      if (openInSandbox) {
        persistEnvMode('sandbox')
        router.push('/overview?demo=sandbox')
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
      subtitle="Enter your company name, then the allowed email and password."
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
          <span className={authLabelClass}>
            Company name <span className="text-[#C2413B]">*</span>
          </span>
          <input
            id="company-name"
            name="organization"
            type="text"
            required
            minLength={2}
            autoComplete="organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={authInputClass}
            placeholder="e.g. Acme Payments"
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
            placeholder="you@company.com"
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3.5 py-3">
          <input
            type="checkbox"
            checked={openInSandbox}
            onChange={(e) => setOpenInSandbox(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#2B55E8] focus:ring-[#2B55E8]"
          />
          <span className="text-[13px] leading-snug text-slate-600">
            <span className="font-semibold text-slate-900">Open in sandbox</span> - safe test workspace instead of live
            payout command.
          </span>
        </label>

        {error ? (
          <div className="rounded-lg border border-[#0B1324]/20 bg-[#F1F5F9] px-3.5 py-2.5 text-[13px] text-[#0B1324]">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? 'Signing in…' : 'Continue'}
        </button>
      </form>
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
