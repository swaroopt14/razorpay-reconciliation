'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'

type LoginFailureCode =
  | 'INVALID_CREDENTIALS'
  | 'WORKSPACE_NOT_FOUND'
  | 'ACCOUNT_NOT_IN_WORKSPACE'
  | 'ACCOUNT_LOCKED'

interface LoginFormDarkProps {
  onSubmit: (email: string, password: string, tenantId: string, environment: 'sandbox' | 'production', rememberDevice: boolean) => Promise<void>
  onSignUpClick?: () => void
  onForgotPassword?: () => void
  emailPlaceholder?: string
  tenantPlaceholder?: string
  submitLabel?: string
  showSocialAuth?: boolean
}

interface FormErrors {
  email?: string
  password?: string
  tenantId?: string
  general?: string
}

const LOGIN_FAILURE_MESSAGES: Record<LoginFailureCode, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  WORKSPACE_NOT_FOUND: 'Workspace not found',
  ACCOUNT_NOT_IN_WORKSPACE: 'Account not part of this workspace',
  ACCOUNT_LOCKED: 'Account temporarily locked',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSubmitErrors(error: unknown): FormErrors {
  const loginError = error as Error & { code?: LoginFailureCode }
  const message =
    loginError?.message && loginError.message.trim().length > 0
      ? loginError.message
      : 'Unable to sign in right now. Please try again.'
  const code = loginError?.code

  if (code === 'WORKSPACE_NOT_FOUND' || message === LOGIN_FAILURE_MESSAGES.WORKSPACE_NOT_FOUND) {
    return { tenantId: LOGIN_FAILURE_MESSAGES.WORKSPACE_NOT_FOUND, general: undefined }
  }

  if (code === 'INVALID_CREDENTIALS' || message === LOGIN_FAILURE_MESSAGES.INVALID_CREDENTIALS) {
    return { general: LOGIN_FAILURE_MESSAGES.INVALID_CREDENTIALS }
  }

  if (code === 'ACCOUNT_NOT_IN_WORKSPACE' || message === LOGIN_FAILURE_MESSAGES.ACCOUNT_NOT_IN_WORKSPACE) {
    return { general: LOGIN_FAILURE_MESSAGES.ACCOUNT_NOT_IN_WORKSPACE }
  }

  if (code === 'ACCOUNT_LOCKED' || message === LOGIN_FAILURE_MESSAGES.ACCOUNT_LOCKED) {
    return { general: LOGIN_FAILURE_MESSAGES.ACCOUNT_LOCKED }
  }

  return { general: message }
}

export function LoginFormDark({
  onSubmit,
  onSignUpClick,
  onForgotPassword,
  emailPlaceholder = 'Enter your email',
  tenantPlaceholder = 'Enter company code',
  submitLabel = 'Login',
  showSocialAuth = false,
}: LoginFormDarkProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false, tenantId: false })
  const workspaceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    workspaceInputRef.current?.focus()
  }, [])

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Email is required'
    }
    if (!EMAIL_REGEX.test(value.trim())) {
      return 'Enter a valid email address'
    }
    return undefined
  }

  const validatePassword = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Password is required'
    }
    return undefined
  }

  const validateTenantId = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Workspace/Tenant ID is required'
    }
    return undefined
  }

  const workspaceError = validateTenantId(tenantId)
  const emailError = validateEmail(email)
  const passwordError = validatePassword(password)
  const isFormValid = !workspaceError && !emailError && !passwordError

  const handleBlur = (field: 'email' | 'password' | 'tenantId') => {
    setTouched((prev) => ({ ...prev, [field]: true }))

    if (field === 'email') {
      setErrors((prev) => ({ ...prev, email: validateEmail(email), general: undefined }))
      return
    }

    if (field === 'password') {
      setErrors((prev) => ({ ...prev, password: validatePassword(password), general: undefined }))
      return
    }

    setErrors((prev) => ({ ...prev, tenantId: validateTenantId(tenantId), general: undefined }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    setTouched({ email: true, password: true, tenantId: true })

    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    const tenantIdError = validateTenantId(tenantId)

    if (emailError || passwordError || tenantIdError) {
      setErrors({
        email: emailError,
        password: passwordError,
        tenantId: tenantIdError,
      })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(
        email.trim().toLowerCase(),
        password,
        tenantId.trim().toLowerCase(),
        environment,
        rememberDevice,
      )
    } catch (error) {
      setErrors(getSubmitErrors(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <style jsx>{`
        .soft-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 0;
        }

        .soft-alert {
          border: 1px solid rgba(248, 113, 113, 0.18);
          border-radius: 14px;
          background: rgba(254, 242, 242, 0.88);
          padding: 12px 14px;
          color: #b91c1c;
        }

        .soft-environment {
          display: inline-flex;
          gap: 5px;
          border-radius: 16px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          background: #f3f5f7;
          padding: 4px;
        }

        .soft-environment-button {
          border-radius: 12px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          transition: all 0.2s ease;
        }

        .soft-environment-button.is-active {
          background: linear-gradient(135deg, #64748b 0%, #334155 100%);
          color: #ffffff;
          box-shadow: 0 10px 20px rgba(51, 65, 85, 0.18);
        }

        .soft-field-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .soft-field-label {
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }

        .soft-field {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .soft-field-icon {
          flex-shrink: 0;
          color: #475569;
        }

        .soft-input {
          width: 100%;
          border: 0;
          background: transparent;
          color: #111827;
          font-size: 15px;
          line-height: 1.45;
          padding: 0;
        }

        .soft-input::placeholder {
          color: #9ca3af;
        }

        .soft-input:focus {
          outline: none;
        }

        .soft-field:focus-within {
          border-color: #94a3b8;
          box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
        }

        .soft-field-error {
          border-color: #fca5a5;
          box-shadow: none;
        }

        .soft-password-toggle {
          color: #64748b;
          transition: color 0.2s ease;
        }

        .soft-password-toggle:hover {
          color: #0f172a;
        }

        .soft-error-text {
          margin-top: 6px;
          font-size: 11px;
          color: #dc2626;
        }

        .soft-helper-text {
          margin-top: 6px;
          font-size: 11px;
          color: #64748b;
        }

        .soft-environment-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }

        .soft-environment-state {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .soft-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .soft-checkbox-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .soft-checkbox {
          height: 16px;
          width: 16px;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
          accent-color: #475569;
        }

        .soft-link {
          font-size: 12px;
          font-weight: 500;
          color: #475569;
          transition: color 0.2s ease;
        }

        .soft-link:hover {
          color: #0f172a;
        }

        .soft-submit {
          width: 100%;
          background: linear-gradient(135deg, #64748b 0%, #334155 100%);
          border-radius: 14px;
          padding: 13px 16px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          box-shadow: 0 16px 30px rgba(51, 65, 85, 0.18);
          transition: filter 0.2s ease, transform 0.2s ease;
        }

        .soft-submit:hover {
          filter: brightness(1.02);
          transform: translateY(-1px);
        }

        .soft-submit:disabled {
          cursor: not-allowed;
          opacity: 0.62;
          transform: none;
          filter: none;
        }

        .soft-social-placeholder {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .soft-social-pill {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          border-radius: 14px;
          padding: 10px 0;
          text-align: center;
          font-size: 13px;
          color: #64748b;
        }
      `}</style>

      <form onSubmit={handleSubmit} className="soft-form" noValidate>
        {errors.general && (
          <div className="soft-alert" role="alert" aria-live="polite">
            <p className="text-sm font-medium">{errors.general}</p>
          </div>
        )}

        <div className="soft-environment-row">
          <div className="soft-environment" aria-label="Workspace mode">
            {(['sandbox', 'production'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`soft-environment-button ${environment === option ? 'is-active' : ''}`}
                onClick={() => setEnvironment(option)}
              >
                {option === 'sandbox' ? 'Sandbox' : 'Production'}
              </button>
            ))}
          </div>
          <span className="soft-environment-state">
            {environment === 'sandbox' ? 'Preview workspace' : 'Secure workspace'}
          </span>
        </div>

        <div className="soft-field-group">
          <div>
            <p className="soft-field-label">Workspace/Tenant ID</p>
            <label htmlFor="tenantId" className="sr-only">
              Workspace/Tenant ID
            </label>
            <div className={`soft-field ${errors.tenantId && touched.tenantId ? 'soft-field-error' : ''}`}>
              <svg className="soft-field-icon h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 20.25h16.5M6 20.25v-9.75m4.5 9.75v-9.75m4.5 9.75v-9.75m4.5 9.75V7.5L12 3.75 3.75 7.5v12.75" />
              </svg>
              <input
                ref={workspaceInputRef}
                id="tenantId"
                name="tenantId"
                type="text"
                autoComplete="organization"
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value)
                  if (touched.tenantId) {
                    setErrors((prev) => ({ ...prev, tenantId: validateTenantId(e.target.value), general: undefined }))
                  }
                }}
                onBlur={() => handleBlur('tenantId')}
                className="soft-input"
                placeholder={tenantPlaceholder}
                disabled={isLoading}
                aria-invalid={errors.tenantId && touched.tenantId ? 'true' : 'false'}
              />
            </div>
            <p className="soft-helper-text">Enter the code provided by your organisation</p>
            {errors.tenantId && touched.tenantId ? <p className="soft-error-text">{errors.tenantId}</p> : null}
          </div>

          <div>
            <p className="soft-field-label">Email</p>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <div className={`soft-field ${errors.email && touched.email ? 'soft-field-error' : ''}`}>
              <svg className="soft-field-icon h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5v10.5H3.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 7.5 7.5 5.25 7.5-5.25" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (touched.email) setErrors((prev) => ({ ...prev, email: validateEmail(e.target.value), general: undefined }))
                }}
                onBlur={() => handleBlur('email')}
                className="soft-input"
                placeholder={emailPlaceholder}
                disabled={isLoading}
                aria-invalid={errors.email && touched.email ? 'true' : 'false'}
              />
            </div>
            {errors.email && touched.email ? <p className="soft-error-text">{errors.email}</p> : null}
          </div>

          <div>
            <p className="soft-field-label">Password</p>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <div className={`soft-field ${errors.password && touched.password ? 'soft-field-error' : ''}`}>
              <svg className="soft-field-icon h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.875a4.5 4.5 0 10-9 0V10.5m-.75 0h10.5A1.5 1.5 0 0118.75 12v6A1.5 1.5 0 0117.25 19.5H6.75A1.5 1.5 0 015.25 18v-6a1.5 1.5 0 011.5-1.5z" />
              </svg>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (touched.password) setErrors((prev) => ({ ...prev, password: validatePassword(e.target.value), general: undefined }))
                }}
                onBlur={() => handleBlur('password')}
                className="soft-input"
                placeholder="Enter your password"
                disabled={isLoading}
                aria-invalid={errors.password && touched.password ? 'true' : 'false'}
              />
              <button
                type="button"
                className="soft-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="soft-row mt-1.5">
              {errors.password && touched.password ? <p className="soft-error-text">{errors.password}</p> : <span />}
              {onForgotPassword ? (
                <button type="button" className="soft-link" onClick={onForgotPassword}>
                  Forgot Password?
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="soft-row">
          <label className="soft-checkbox-wrap" htmlFor="rememberDevice">
            <input
              id="rememberDevice"
              name="rememberDevice"
              type="checkbox"
              className="soft-checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              disabled={isLoading}
            />
            Remember this device
          </label>

          {onSignUpClick ? (
            <button type="button" className="soft-link" onClick={onSignUpClick}>
              Request access
            </button>
          ) : null}
        </div>

        <button type="submit" className="soft-submit" disabled={isLoading || !isFormValid} aria-busy={isLoading}>
          {isLoading ? 'Logging in...' : submitLabel}
        </button>

        {showSocialAuth ? (
          <div className="soft-social-placeholder">
            {['Google', 'Apple', 'X', 'Discord'].map((provider) => (
              <div key={provider} className="soft-social-pill">
                {provider}
              </div>
            ))}
          </div>
        ) : null}
      </form>
    </>
  )
}
