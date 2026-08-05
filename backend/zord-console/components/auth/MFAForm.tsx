'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'

interface MFAFormProps {
  onSubmit: (code: string) => Promise<void>
  onBack?: () => void
  environment: 'sandbox' | 'production'
  mfaMethod?: 'totp' | 'sms' | 'hardware'
}

interface FormErrors {
  code?: string
  general?: string
}

export function MFAForm({
  onSubmit,
  onBack,
  environment,
  mfaMethod = 'totp',
}: MFAFormProps) {
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    codeInputRef.current?.focus()
  }, [])

  const validateCode = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Verification code is required'
    }
    if (mfaMethod === 'totp' && !/^\d{6}$/.test(value.trim())) {
      return 'Code must be 6 digits'
    }
    return undefined
  }

  const handleCodeChange = (value: string) => {
    if (mfaMethod === 'totp') {
      setCode(value.replace(/\D/g, '').slice(0, 6))
    } else {
      setCode(value)
    }

    if (errors.code) {
      setErrors((prev) => ({ ...prev, code: undefined, general: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const codeError = validateCode(code)
    if (codeError) {
      setErrors({ code: codeError })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(code.trim())
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'Invalid verification code. Please try again.',
      })
      setIsLoading(false)
      setCode('')
      codeInputRef.current?.focus()
    }
  }

  const methodName =
    mfaMethod === 'sms' ? 'SMS' : mfaMethod === 'hardware' ? 'hardware key' : 'authenticator app'

  return (
    <>
      <style jsx>{`
        .mfa-stack {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .mfa-copy {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 18px 20px;
        }

        .mfa-copy p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.7;
        }

        .mfa-alert {
          border: 1px solid rgba(248, 113, 113, 0.24);
          border-radius: 16px;
          background: rgba(254, 242, 242, 0.82);
          padding: 14px 16px;
          color: #b91c1c;
        }

        .mfa-input-shell {
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          background: #ffffff;
          padding: 18px;
        }

        .mfa-input {
          width: 100%;
          border: 0;
          background: transparent;
          color: #111827;
          font-size: 34px;
          font-weight: 600;
          letter-spacing: 0.28em;
          text-align: center;
        }

        .mfa-input::placeholder {
          color: #cbd5e1;
          letter-spacing: 0.16em;
        }

        .mfa-input:focus {
          outline: none;
        }

        .mfa-error-text {
          font-size: 12px;
          color: #dc2626;
        }

        .mfa-actions {
          display: grid;
          gap: 12px;
        }

        .mfa-submit {
          width: 100%;
          background: linear-gradient(135deg, #64748b 0%, #334155 100%);
          border-radius: 14px;
          padding: 14px 18px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 600;
          box-shadow: 0 14px 30px rgba(51, 65, 85, 0.18);
          transition: filter 0.2s ease, transform 0.2s ease;
        }

        .mfa-submit:hover {
          filter: brightness(1.02);
          transform: translateY(-1px);
        }

        .mfa-submit:disabled {
          cursor: not-allowed;
          opacity: 0.62;
          transform: none;
          filter: none;
        }

        .mfa-back {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
          padding: 13px 18px;
          color: #475569;
          font-size: 15px;
          font-weight: 600;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .mfa-back:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
      `}</style>

      <form onSubmit={handleSubmit} className="mfa-stack" noValidate>
        <div className="mfa-copy">
          <p>
            Enter the 6-digit code from your {methodName}. {environment === 'production' ? 'Production access is protected by MFA.' : 'Sandbox verification remains available when needed.'}
          </p>
        </div>

        {errors.general ? (
          <div className="mfa-alert" role="alert" aria-live="polite">
            <p className="text-sm font-medium">{errors.general}</p>
          </div>
        ) : null}

        <div className="mfa-input-shell">
          <label htmlFor="mfaCode" className="sr-only">
            Verification code
          </label>
          <input
            ref={codeInputRef}
            id="mfaCode"
            name="mfaCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            className="mfa-input"
            placeholder="000000"
            aria-invalid={errors.code ? 'true' : 'false'}
            disabled={isLoading}
          />
        </div>

        {errors.code ? <p className="mfa-error-text">{errors.code}</p> : null}

        <div className="mfa-actions">
          <button type="submit" className="mfa-submit" disabled={isLoading}>
            {isLoading ? 'Verifying...' : 'Verify and continue'}
          </button>
          {onBack ? (
            <button type="button" className="mfa-back" onClick={onBack} disabled={isLoading}>
              Back to login
            </button>
          ) : null}
        </div>
      </form>
    </>
  )
}
