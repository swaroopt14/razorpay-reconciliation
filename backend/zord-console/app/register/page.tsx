'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout'
import { authInputClass, authLabelClass, authPrimaryButtonClass } from '@/components/auth/authUiTokens'

type SignupResult = {
  apiKey: string
  tenantId: string
  tenantName: string
}

const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'letter', label: 'Contains a letter', test: (pw) => /[a-zA-Z]/.test(pw) },
  { id: 'number', label: 'Contains a number', test: (pw) => /\d/.test(pw) },
  { id: 'length', label: 'Has 9 or more characters', test: (pw) => pw.length >= 9 },
]

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.id} className="flex items-center gap-2 text-[12.5px]">
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full ${
                ok ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
              }`}
            >
              {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={ok ? 'font-medium text-slate-700' : 'text-slate-500'}>{rule.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * /register — internal tenant provisioning (used by sales/admin once a demo lead
 * is qualified). Creates a tenant + first admin user and reveals the API key once.
 * Public customer enquiries go through /signup (the "Book a demo" flow).
 */
export default function RegisterPage() {
  const router = useRouter()

  const [tenantName, setTenantName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupResult, setSignupResult] = useState<SignupResult | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const passwordValid = useMemo(() => PASSWORD_RULES.every((r) => r.test(password)), [password])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!passwordValid) {
      setError('Password must contain a letter, a number, and be at least 9 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_name: tenantName.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message ?? 'Unable to create the tenant right now.')
        setLoading(false)
        return
      }
      const apiKey: string | undefined = data?.api_key
      const tenantId: string | undefined = data?.user?.tenant_id ?? data?.session?.tenant_id
      const newTenantName: string | undefined = data?.user?.tenant_name
      if (apiKey && tenantId) {
        try {
          window.localStorage.setItem(`zord_tenant_api_key:${tenantId}`, apiKey)
        } catch {
          /* localStorage can be disabled */
        }
        setSignupResult({ apiKey, tenantId, tenantName: newTenantName ?? tenantName })
        setLoading(false)
        return
      }
      persistEnvMode('sandbox')
      router.push('/sandbox')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  async function handleCopyKey() {
    if (!signupResult) return
    try {
      await navigator.clipboard.writeText(signupResult.apiKey)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      /* clipboard API */
    }
  }

  function handleContinue() {
    persistEnvMode('sandbox')
    router.push('/sandbox')
    router.refresh()
  }

  useEffect(() => {
    if (signupResult) persistEnvMode('sandbox')
  }, [signupResult])

  if (signupResult) {
    return (
      <AuthSplitLayout
        variant="signup"
        eyebrow="Workspace ready"
        title="Save your tenant API key"
        subtitle={`${signupResult.tenantName} is live. Copy the secret below — we only show it once.`}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          <strong className="font-semibold">One-time disclosure.</strong> Rotate from Settings → API keys if you lose
          this secret.
        </div>

        <p className="mt-4 text-[13px] text-slate-500">
          Tenant id:{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
            {signupResult.tenantId}
          </code>
        </p>

        <div className="mt-4">
          <label className={authLabelClass}>Secret API key</label>
          <div className="mt-1.5 flex items-stretch gap-2">
            <code className="flex-1 break-all rounded-lg border border-slate-200 bg-slate-900 px-3 py-3 font-mono text-[11px] leading-relaxed text-emerald-300">
              {signupResult.apiKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="shrink-0 rounded-lg bg-[#2B55E8] px-4 text-[13px] font-semibold text-white hover:bg-[#2348C9]"
            >
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <button type="button" onClick={handleContinue} className={`${authPrimaryButtonClass} mt-6`}>
          Continue to sandbox
        </button>
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
      variant="signup"
      eyebrow="Provision a workspace"
      title="Create a Zord tenant"
      subtitle="Set up the tenant and its first admin. The workspace opens in sandbox so you can verify before going live."
      footer={
        <>
          <p className="text-center text-[13px] text-slate-500">
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold text-[#2B55E8] hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
            By creating a workspace you agree to our{' '}
            <Link href="/terms" className="font-medium text-[#2B55E8] hover:underline">
              terms of use
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-[#2B55E8] hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className={authLabelClass}>Company / tenant name</span>
          <input
            type="text"
            required
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            className={authInputClass}
            placeholder="e.g. Acme Payments"
            autoComplete="organization"
          />
        </label>

        <label className="block">
          <span className={authLabelClass}>Admin full name</span>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputClass}
            placeholder="e.g. Alex Patel"
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
            placeholder="admin@company.com"
          />
        </label>

        <label className="block">
          <span className={authLabelClass}>Password</span>
          <div className="relative mt-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authInputClass} mt-0 pr-16`}
              placeholder="Create a strong password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {password ? <PasswordChecklist password={password} /> : null}
        </label>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={loading || !passwordValid} className={authPrimaryButtonClass}>
          {loading ? 'Creating workspace…' : 'Create tenant'}
        </button>
      </form>
    </AuthSplitLayout>
  )
}
