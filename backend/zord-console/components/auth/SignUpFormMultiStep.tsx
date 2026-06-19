'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ZordLogo } from '@/components/ZordLogo'

interface SignUpFormMultiStepProps {
  onSubmit: (data: SignUpData) => Promise<void>
  onLoginClick?: () => void
}

interface SignUpData {
  // Step 1: Organization Details
  organizationName: string
  organizationType: string
  country: string
  useCases: string[]

  // Step 2: First Admin User
  firstName: string
  lastName: string
  email: string
  password: string

  // Step 3: Tenant Setup
  tenantId: string
  timezone: string

  // Step 4: Verification
  agreeToTerms: boolean
  agreeToDPA: boolean
  understandNoFunds: boolean

  // Step 5: Choose mode (sandbox vs live)
  mode: 'sandbox' | 'live' | ''
}

interface FormErrors {
  organizationName?: string
  organizationType?: string
  country?: string
  useCases?: string
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  tenantId?: string
  timezone?: string
  agreeToTerms?: string
  agreeToDPA?: string
  understandNoFunds?: string
  mode?: string
  general?: string
}

type Step = 1 | 2 | 3 | 4 | 5

export function SignUpFormMultiStep({ 
  onSubmit,
  onLoginClick
}: SignUpFormMultiStepProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [formData, setFormData] = useState<SignUpData>({
    organizationName: '',
    organizationType: '',
    country: '',
    useCases: [],
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    tenantId: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    agreeToTerms: false,
    agreeToDPA: false,
    understandNoFunds: false,
    mode: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Common timezones
  const timezones = [
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'UTC',
  ]

  // Validation functions
  const validateOrganizationName = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Organization name is required'
    }
    if (value.trim().length < 2) {
      return 'Organization name must be at least 2 characters'
    }
    return undefined
  }

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Work email is required'
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address'
    }
    return undefined
  }

  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return 'Password is required'
    }
    if (value.length < 12) {
      return 'Password must be at least 12 characters'
    }
    const hasUpper = /[A-Z]/.test(value)
    const hasLower = /[a-z]/.test(value)
    const hasNumber = /[0-9]/.test(value)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value)
    
    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      return 'Password must contain uppercase, lowercase, number, and special character'
    }
    return undefined
  }

  const validateTenantId = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Tenant ID is required'
    }
    if (!/^[a-z0-9-]+$/i.test(value.trim())) {
      return 'Tenant ID can only contain letters, numbers, and hyphens'
    }
    if (value.trim().length < 3) {
      return 'Tenant ID must be at least 3 characters'
    }
    return undefined
  }

  const validateStep = (step: Step): boolean => {
    const newErrors: FormErrors = {}

    if (step === 1) {
      if (!formData.organizationName.trim()) {
        newErrors.organizationName = 'Organization name is required'
      }
      if (!formData.organizationType) {
        newErrors.organizationType = 'Organization type is required'
      }
      if (!formData.country) {
        newErrors.country = 'Country is required'
      }
      if (formData.useCases.length === 0) {
        newErrors.useCases = 'Select at least one use case'
      }
    } else if (step === 2) {
      if (!formData.firstName.trim()) {
        newErrors.firstName = 'First name is required'
      }
      if (!formData.lastName.trim()) {
        newErrors.lastName = 'Last name is required'
      }
      const emailError = validateEmail(formData.email)
      if (emailError) newErrors.email = emailError
      const passwordError = validatePassword(formData.password)
      if (passwordError) newErrors.password = passwordError
    } else if (step === 3) {
      const tenantIdError = validateTenantId(formData.tenantId)
      if (tenantIdError) newErrors.tenantId = tenantIdError
      if (!formData.timezone) {
        newErrors.timezone = 'Timezone is required'
      }
    } else if (step === 4) {
      if (!formData.agreeToTerms) {
        newErrors.agreeToTerms = 'You must agree to the Terms of Service'
      }
      if (!formData.agreeToDPA) {
        newErrors.agreeToDPA = 'You must agree to the Data Processing Agreement'
      }
      if (!formData.understandNoFunds) {
        newErrors.understandNoFunds = 'You must acknowledge this requirement'
      }
    } else if (step === 5) {
      if (formData.mode !== 'sandbox' && formData.mode !== 'live') {
        newErrors.mode = 'Choose a starting mode'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 5) {
        setCurrentStep((currentStep + 1) as Step)
        setErrors({})
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
      setErrors({})
    }
  }

  /**
   * Persist the chosen mode to localStorage so the EnvironmentProvider in the
   * post-signup app picks it up on first mount. Live-chosen accounts start
   * with `liveActivationStatus = 'not_started'` so the toggle stays locked
   * until the activate-live wizard is completed inside the app.
   */
  const persistChosenMode = (mode: 'sandbox' | 'live') => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        'zord:environment',
        JSON.stringify({
          mode,
          liveActivationStatus: 'not_started',
          checklistComplete: { run_scenario: false, upload_test_file: false, view_api_keys: false, view_docs: false },
        }),
      )
    } catch {
      // Privacy mode / quota — silently ignore.
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateStep(5)) {
      return
    }

    setIsLoading(true)
    setErrors({})

    if (formData.mode === 'sandbox' || formData.mode === 'live') {
      persistChosenMode(formData.mode)
    }

    try {
      await onSubmit(formData)
      // Sandbox + live live at separate routes — navigate based on the user's
      // chosen mode. The EnvironmentProvider on the destination route reads
      // the localStorage state we persisted above.
      if (formData.mode === 'sandbox') {
        router.push('/sandbox')
      } else if (formData.mode === 'live') {
        router.push('/payout-command-view/today')
      }
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
      setIsLoading(false)
    }
  }

  const updateFormData = (field: keyof SignUpData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined, general: undefined }))
    }
  }

  const toggleUseCase = (useCase: string) => {
    const newUseCases = formData.useCases.includes(useCase)
      ? formData.useCases.filter(uc => uc !== useCase)
      : [...formData.useCases, useCase]
    updateFormData('useCases', newUseCases)
  }

  // Step 1: Organization Details
  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <label htmlFor="organizationName" className="block text-sm font-medium text-gray-300 mb-2">
          Organization Legal Name *
        </label>
        <input
          id="organizationName"
          name="organizationName"
          type="text"
          value={formData.organizationName}
          onChange={(e) => updateFormData('organizationName', e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.organizationName ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="Acme Finance Pvt Ltd"
          disabled={isLoading}
        />
        {errors.organizationName && (
          <p className="mt-2 text-sm text-red-400">{errors.organizationName}</p>
        )}
      </div>

      <div>
        <label htmlFor="organizationType" className="block text-sm font-medium text-gray-300 mb-2">
          Organization Type *
        </label>
        <select
          id="organizationType"
          name="organizationType"
          value={formData.organizationType}
          onChange={(e) => updateFormData('organizationType', e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.organizationType ? 'border-red-500' : 'border-gray-700'
          }`}
          disabled={isLoading}
        >
          <option value="">Select organization type</option>
          <option value="nbfc">NBFC</option>
          <option value="bank">Bank</option>
          <option value="marketplace">Marketplace</option>
          <option value="fintech">Fintech</option>
          <option value="enterprise">Enterprise</option>
          <option value="other">Other</option>
        </select>
        {errors.organizationType && (
          <p className="mt-2 text-sm text-red-400">{errors.organizationType}</p>
        )}
      </div>

      <div>
        <label htmlFor="country" className="block text-sm font-medium text-gray-300 mb-2">
          Country of Operation *
        </label>
        <select
          id="country"
          name="country"
          value={formData.country}
          onChange={(e) => updateFormData('country', e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.country ? 'border-red-500' : 'border-gray-700'
          }`}
          disabled={isLoading}
        >
          <option value="">Select country</option>
          <option value="IN">India</option>
          <option value="US">United States</option>
          <option value="GB">United Kingdom</option>
          <option value="AE">United Arab Emirates</option>
          <option value="SG">Singapore</option>
        </select>
        {errors.country && (
          <p className="mt-2 text-sm text-red-400">{errors.country}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Primary Use Case * (Select all that apply)
        </label>
        <div className="space-y-2">
          {['Payouts', 'Collections', 'Refunds', 'Internal transfers'].map((useCase) => (
            <label key={useCase} className="flex items-center">
              <input
                type="checkbox"
                checked={formData.useCases.includes(useCase)}
                onChange={() => toggleUseCase(useCase)}
                className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
                disabled={isLoading}
              />
              <span className="ml-2 text-gray-300">{useCase}</span>
            </label>
          ))}
        </div>
        {errors.useCases && (
          <p className="mt-2 text-sm text-red-400">{errors.useCases}</p>
        )}
      </div>
    </div>
  )

  // Step 2: First Admin User
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-400">
          <strong>First user is always Tenant Admin.</strong> Additional users and RBAC can be configured after account creation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-2">
            Full Name *
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={(e) => updateFormData('firstName', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
              errors.firstName ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="First name"
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className="mt-2 text-sm text-red-400">{errors.firstName}</p>
          )}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-2">
            &nbsp;
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={(e) => updateFormData('lastName', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
              errors.lastName ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="Last name"
            disabled={isLoading}
          />
          {errors.lastName && (
            <p className="mt-2 text-sm text-red-400">{errors.lastName}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
          Work Email *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={(e) => updateFormData('email', e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.email ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="name@company.com"
          disabled={isLoading}
        />
        {errors.email && (
          <p className="mt-2 text-sm text-red-400">{errors.email}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
          Password *
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => updateFormData('password', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pr-12 ${
              errors.password ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="Minimum 12 characters"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            disabled={isLoading}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        {errors.password && (
          <p className="mt-2 text-sm text-red-400">{errors.password}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Role: Tenant Admin (fixed)</p>
      </div>
    </div>
  )

  // Step 3: Tenant Setup
  const renderStep3 = () => (
    <div className="space-y-5">
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
        <p className="text-sm text-yellow-400">
          <strong>Important:</strong> Tenant ID is immutable after creation. It will be used in URLs, APIs, and evidence paths.
        </p>
      </div>

      <div>
        <label htmlFor="tenantId" className="block text-sm font-medium text-gray-300 mb-2">
          Tenant ID (Slug) *
        </label>
        <input
          id="tenantId"
          name="tenantId"
          type="text"
          value={formData.tenantId}
          onChange={(e) => updateFormData('tenantId', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.tenantId ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="acme-finance"
          disabled={isLoading}
        />
        {errors.tenantId && (
          <p className="mt-2 text-sm text-red-400">{errors.tenantId}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Only lowercase letters, numbers, and hyphens. Cannot be changed later.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Default Environment
        </label>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            <strong>Sandbox</strong> will be created automatically. Production requires approval after account verification.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-2">
          Timezone *
        </label>
        <select
          id="timezone"
          name="timezone"
          value={formData.timezone}
          onChange={(e) => updateFormData('timezone', e.target.value)}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.timezone ? 'border-red-500' : 'border-gray-700'
          }`}
          disabled={isLoading}
        >
          {timezones.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        {errors.timezone && (
          <p className="mt-2 text-sm text-red-400">{errors.timezone}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Important for ingestion timestamps & evidence</p>
      </div>
    </div>
  )

  // Step 4: Verification & Guardrails
  const renderStep4 = () => (
    <div className="space-y-5">
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 mb-4">
        <p className="text-sm text-purple-400">
          Email verification will be sent after account creation. You must verify your email before accessing the console.
        </p>
      </div>

      <div className="space-y-4">
        <label className="flex items-start">
          <input
            type="checkbox"
            checked={formData.agreeToTerms}
            onChange={(e) => updateFormData('agreeToTerms', e.target.checked)}
            className="mt-1 mr-3 w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-300">
            I accept the{' '}
            <Link href="#" className="text-purple-500 hover:text-purple-400 underline">
              Terms of Service
            </Link>
            {' '}*
          </span>
        </label>
        {errors.agreeToTerms && (
          <p className="ml-7 text-sm text-red-400">{errors.agreeToTerms}</p>
        )}

        <label className="flex items-start">
          <input
            type="checkbox"
            checked={formData.agreeToDPA}
            onChange={(e) => updateFormData('agreeToDPA', e.target.checked)}
            className="mt-1 mr-3 w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-300">
            I accept the{' '}
            <Link href="#" className="text-purple-500 hover:text-purple-400 underline">
              Data Processing Agreement
            </Link>
            {' '}*
          </span>
        </label>
        {errors.agreeToDPA && (
          <p className="ml-7 text-sm text-red-400">{errors.agreeToDPA}</p>
        )}

        <label className="flex items-start">
          <input
            type="checkbox"
            checked={formData.understandNoFunds}
            onChange={(e) => updateFormData('understandNoFunds', e.target.checked)}
            className="mt-1 mr-3 w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-300">
            I understand that Zord does not move funds *
          </span>
        </label>
        {errors.understandNoFunds && (
          <p className="ml-7 text-sm text-red-400">{errors.understandNoFunds}</p>
        )}
      </div>
    </div>
  )

  // Step 5: Choose starting mode (sandbox vs live)
  const renderStep5 = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Choose how you want to start</h2>
        <p className="mt-1 text-sm text-gray-400">
          You can switch later. Most teams start in sandbox to wire up the integration before activating live.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Sandbox */}
        <button
          type="button"
          onClick={() => updateFormData('mode', 'sandbox')}
          disabled={isLoading}
          className={`flex flex-col rounded-xl border p-5 text-left transition ${
            formData.mode === 'sandbox'
              ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
              : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Recommended
            </span>
            {formData.mode === 'sandbox' ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-white">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">Start in sandbox</h3>
          <p className="mt-1 text-sm text-gray-400">
            Frictionless setup. Test data only · no real funds move. Upgrade to live anytime.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-gray-400">
            <li>✓ <span className="font-mono text-gray-300">pk_test_…</span> keys issued immediately</li>
            <li>✓ Canned test scenarios + Postman collection</li>
            <li>✓ No KYC, no payment method, no business info</li>
          </ul>
        </button>

        {/* Live */}
        <button
          type="button"
          onClick={() => updateFormData('mode', 'live')}
          disabled={isLoading}
          className={`flex flex-col rounded-xl border p-5 text-left transition ${
            formData.mode === 'live'
              ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
              : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Production
            </span>
            {formData.mode === 'live' ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-white">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">Set up live account</h3>
          <p className="mt-1 text-sm text-gray-400">
            For teams ready to move real money. We&apos;ll guide you through KYC, connectors, and plan after signup.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-gray-400">
            <li>✓ Sandbox available too — switch anytime</li>
            <li>✓ Activation wizard inside the app (~24h review)</li>
            <li>✓ Live keys issued only after KYC + connectors approved</li>
          </ul>
        </button>
      </div>

      {errors.mode ? <p className="text-sm text-red-400">{errors.mode}</p> : null}

      <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-400">
        Tip: developers and integrators almost always start in sandbox to validate the integration end-to-end before
        flipping to live.
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors.general && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm font-medium text-red-400">{errors.general}</p>
        </div>
      )}

      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-6">
        {[1, 2, 3, 4, 5].map((step) => (
          <div key={step} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
              currentStep >= step
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'border-gray-700 text-gray-500'
            }`}>
              {step}
            </div>
            {step < 5 && (
              <div className={`flex-1 h-0.5 mx-2 ${
                currentStep > step ? 'bg-purple-600' : 'bg-gray-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1 || isLoading}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={isLoading}
            className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading || (formData.mode !== 'sandbox' && formData.mode !== 'live')}
            className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Creating account...'
              : formData.mode === 'sandbox'
                ? 'Create sandbox account'
                : formData.mode === 'live'
                  ? 'Create live account'
                  : 'Create account'}
          </button>
        )}
      </div>

      {onLoginClick && (
        <p className="text-center text-sm text-gray-400">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onLoginClick}
            className="text-purple-500 hover:text-purple-400 underline"
          >
            Log in
          </button>
        </p>
      )}
    </form>
  )
}
