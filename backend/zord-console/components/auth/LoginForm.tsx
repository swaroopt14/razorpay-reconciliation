'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import Link from 'next/link'

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>
  emailPlaceholder?: string
  showAdminOption?: boolean
  onAdminLogin?: () => Promise<void>
}

interface FormErrors {
  email?: string
  password?: string
  general?: string
}

export function LoginForm({ 
  onSubmit, 
  emailPlaceholder = 'user@example.com',
  showAdminOption = false,
  onAdminLogin
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isAdminLoading, setIsAdminLoading] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus email input on mount for better UX
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Email or username is required'
    }
    // Basic email validation (also allows username)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const usernameRegex = /^[a-zA-Z0-9_]{3,}$/
    if (!emailRegex.test(value) && !usernameRegex.test(value)) {
      return 'Please enter a valid email address or username'
    }
    return undefined
  }

  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return 'Password is required'
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters'
    }
    return undefined
  }

  const handleBlur = (field: 'email' | 'password') => {
    setTouched(prev => ({ ...prev, [field]: true }))
    if (field === 'email') {
      const error = validateEmail(email)
      setErrors(prev => ({ ...prev, email: error }))
    } else if (field === 'password') {
      const error = validatePassword(password)
      setErrors(prev => ({ ...prev, password: error }))
    }
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (touched.email) {
      const error = validateEmail(value)
      setErrors(prev => ({ ...prev, email: error, general: undefined }))
    }
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (touched.password) {
      const error = validatePassword(value)
      setErrors(prev => ({ ...prev, password: error, general: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    // Mark all fields as touched
    setTouched({ email: true, password: true })
    
    // Validate all fields
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    
    if (emailError || passwordError) {
      setErrors({
        email: emailError,
        password: passwordError,
      })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(email.trim(), password)
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
      setIsLoading(false)
    }
  }

  const handleAdminLogin = async () => {
    if (!onAdminLogin) return
    
    setIsAdminLoading(true)
    setErrors({})

    try {
      await onAdminLogin()
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
      setIsAdminLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      const form = e.target.closest('form')
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement
        if (submitButton && !isLoading) {
          submitButton.click()
        }
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* General Error Message */}
      {errors.general && (
        <div 
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start"
          role="alert"
          aria-live="polite"
        >
          <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{errors.general}</p>
          </div>
        </div>
      )}

      {/* Email/Username Field */}
      <div>
        <label 
          htmlFor="email" 
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Email or Username
          <span className="text-red-500 ml-1" aria-label="required">*</span>
        </label>
        <input
          ref={emailInputRef}
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onBlur={() => handleBlur('email')}
          onKeyDown={handleKeyDown}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all ${
            errors.email && touched.email
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 bg-white'
          }`}
          placeholder={emailPlaceholder}
          aria-invalid={errors.email && touched.email ? 'true' : 'false'}
          aria-describedby={errors.email && touched.email ? 'email-error' : undefined}
          disabled={isLoading || isAdminLoading}
        />
        {errors.email && touched.email && (
          <p 
            id="email-error" 
            className="mt-2 text-sm text-red-600" 
            role="alert"
          >
            {errors.email}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div>
        <label 
          htmlFor="password" 
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Password
          <span className="text-red-500 ml-1" aria-label="required">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onBlur={() => handleBlur('password')}
            onKeyDown={handleKeyDown}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all pr-12 ${
              errors.password && touched.password
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 bg-white'
            }`}
            placeholder="Enter your password"
            aria-invalid={errors.password && touched.password ? 'true' : 'false'}
            aria-describedby={errors.password && touched.password ? 'password-error' : undefined}
            disabled={isLoading || isAdminLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded p-1 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            disabled={isLoading || isAdminLoading}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 12m3.29-5.71L12 12m-8.71 0L3 21m8.71-9L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && touched.password && (
          <p 
            id="password-error" 
            className="mt-2 text-sm text-red-600" 
            role="alert"
          >
            {errors.password}
          </p>
        )}
      </div>

      {/* Forgot Password Link */}
      <div className="flex items-center justify-between">
        <Link 
          href="#" 
          className="text-sm text-orange-600 hover:text-orange-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded"
          tabIndex={isLoading || isAdminLoading ? -1 : 0}
        >
          Forgot password?
        </Link>
      </div>

      {/* Submit Button */}
      <div className={`space-y-3 pt-4 ${showAdminOption ? '' : 'pt-0'}`}>
        <button
          type="submit"
          disabled={isLoading || isAdminLoading}
          className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-lg hover:from-orange-600 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-orange-500 disabled:hover:to-red-500"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>

        {showAdminOption && onAdminLogin && (
          <button
            type="button"
            onClick={handleAdminLogin}
            disabled={isLoading || isAdminLoading}
            className="w-full py-3 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-busy={isAdminLoading}
          >
            {isAdminLoading ? 'Signing in...' : 'Sign In as Admin'}
          </button>
        )}
      </div>
    </form>
  )
}
