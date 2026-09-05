'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import Link from 'next/link'

interface SignUpFormProps {
  onSubmit: (firstName: string, lastName: string, email: string, password: string) => Promise<void>
  onLoginClick?: () => void
  onGoogleLogin?: () => void
  onAppleLogin?: () => void
}

interface FormErrors {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  terms?: string
  general?: string
}

export function SignUpForm({ 
  onSubmit,
  onLoginClick,
  onGoogleLogin,
  onAppleLogin
}: SignUpFormProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [touched, setTouched] = useState({ firstName: false, lastName: false, email: false, password: false })
  const firstNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstNameInputRef.current?.focus()
  }, [])

  const validateFirstName = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'First name is required'
    }
    return undefined
  }

  const validateLastName = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Last name is required'
    }
    return undefined
  }

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return 'Email is required'
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
    if (value.length < 6) {
      return 'Password must be at least 6 characters'
    }
    return undefined
  }

  const handleBlur = (field: 'firstName' | 'lastName' | 'email' | 'password') => {
    setTouched(prev => ({ ...prev, [field]: true }))
    if (field === 'firstName') {
      const error = validateFirstName(firstName)
      setErrors(prev => ({ ...prev, firstName: error, general: undefined }))
    } else if (field === 'lastName') {
      const error = validateLastName(lastName)
      setErrors(prev => ({ ...prev, lastName: error, general: undefined }))
    } else if (field === 'email') {
      const error = validateEmail(email)
      setErrors(prev => ({ ...prev, email: error, general: undefined }))
    } else if (field === 'password') {
      const error = validatePassword(password)
      setErrors(prev => ({ ...prev, password: error, general: undefined }))
    }
  }

  const handleFirstNameChange = (value: string) => {
    setFirstName(value)
    if (touched.firstName) {
      const error = validateFirstName(value)
      setErrors(prev => ({ ...prev, firstName: error, general: undefined }))
    }
  }

  const handleLastNameChange = (value: string) => {
    setLastName(value)
    if (touched.lastName) {
      const error = validateLastName(value)
      setErrors(prev => ({ ...prev, lastName: error, general: undefined }))
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
    
    setTouched({ firstName: true, lastName: true, email: true, password: true })
    
    const firstNameError = validateFirstName(firstName)
    const lastNameError = validateLastName(lastName)
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    
    if (firstNameError || lastNameError || emailError || passwordError) {
      setErrors({
        firstName: firstNameError,
        lastName: lastNameError,
        email: emailError,
        password: passwordError,
      })
      return
    }

    if (!agreeToTerms) {
      setErrors({ terms: 'You must agree to the Terms & Conditions' })
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      await onSubmit(firstName.trim(), lastName.trim(), email.trim(), password)
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {errors.general && (
        <div 
          className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start"
          role="alert"
          aria-live="polite"
        >
          <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm font-medium text-red-400">{errors.general}</p>
        </div>
      )}

      {/* First Name and Last Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <input
            ref={firstNameInputRef}
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => handleFirstNameChange(e.target.value)}
            onBlur={() => handleBlur('firstName')}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
              errors.firstName && touched.firstName
                ? 'border-red-500'
                : 'border-gray-700'
            }`}
            placeholder="First name"
            aria-invalid={errors.firstName && touched.firstName ? 'true' : 'false'}
            disabled={isLoading}
          />
          {errors.firstName && touched.firstName && (
            <p className="mt-2 text-sm text-red-400" role="alert">
              {errors.firstName}
            </p>
          )}
        </div>
        <div>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => handleLastNameChange(e.target.value)}
            onBlur={() => handleBlur('lastName')}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
              errors.lastName && touched.lastName
                ? 'border-red-500'
                : 'border-gray-700'
            }`}
            placeholder="Last name"
            aria-invalid={errors.lastName && touched.lastName ? 'true' : 'false'}
            disabled={isLoading}
          />
          {errors.lastName && touched.lastName && (
            <p className="mt-2 text-sm text-red-400" role="alert">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      {/* Email */}
      <div>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onBlur={() => handleBlur('email')}
          className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
            errors.email && touched.email
              ? 'border-red-500'
              : 'border-gray-700'
          }`}
          placeholder="Email"
          aria-invalid={errors.email && touched.email ? 'true' : 'false'}
          disabled={isLoading}
        />
        {errors.email && touched.email && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onBlur={() => handleBlur('password')}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pr-12 ${
              errors.password && touched.password
                ? 'border-red-500'
                : 'border-gray-700'
            }`}
            placeholder="Enter your password"
            aria-invalid={errors.password && touched.password ? 'true' : 'false'}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded p-1 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            disabled={isLoading}
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
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      {/* Terms & Conditions */}
      <div>
        <label className="flex items-start">
          <input
            type="checkbox"
            checked={agreeToTerms}
            onChange={(e) => {
              setAgreeToTerms(e.target.checked)
              if (errors.terms) {
                setErrors(prev => ({ ...prev, terms: undefined }))
              }
            }}
            className="mt-1 mr-3 w-4 h-4 text-purple-600 bg-gray-800 border-gray-700 rounded focus:ring-purple-500 focus:ring-2"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-400">
            I agree to the{' '}
            <Link href="#" className="text-purple-500 hover:text-purple-400 underline">
              Terms & Conditions
            </Link>
          </span>
        </label>
        {errors.terms && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errors.terms}
          </p>
        )}
      </div>

      {/* Create Account Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={isLoading}
      >
        {isLoading ? 'Creating account...' : 'Create account'}
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-900 text-gray-500">Or register with</span>
        </div>
      </div>

      {/* Social Login Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={isLoading}
          className="flex items-center justify-center space-x-2 py-3 px-4 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Google</span>
        </button>
        <button
          type="button"
          onClick={onAppleLogin}
          disabled={isLoading}
          className="flex items-center justify-center space-x-2 py-3 px-4 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          <span>Apple</span>
        </button>
      </div>

      {/* Login Link */}
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
