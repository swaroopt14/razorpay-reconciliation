'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setCurrentUser, setCurrentRole } from '@/services/auth'
import { DarkLoginLayout, SignUpFormMultiStep, LoginFormDark, MFAForm } from '@/components/auth'
import { ZordLogo } from '@/components/ZordLogo'

type AuthStep = 'login' | 'signup' | 'mfa'

interface SignUpData {
  organizationName: string
  organizationType: string
  country: string
  useCases: string[]
  firstName: string
  lastName: string
  email: string
  password: string
  tenantId: string
  timezone: string
  agreeToTerms: boolean
  agreeToDPA: boolean
  understandNoFunds: boolean
}

export default function ConsoleLoginPage() {
  const router = useRouter()
  const [authStep, setAuthStep] = useState<AuthStep>('login')
  const [mfaEnvironment, setMfaEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [pendingLoginData, setPendingLoginData] = useState<{
    email: string
    tenantId: string
    environment: 'sandbox' | 'production'
  } | null>(null)

  const handleSignUp = async (data: SignUpData) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    setCurrentUser({
      id: 'user_1',
      email: data.email,
      role: 'CUSTOMER_USER',
      tenant: data.tenantId,
      name: `${data.firstName} ${data.lastName}`,
    })
    setCurrentRole('CUSTOMER_USER')

    // Route console auth flow to customer-test workspace for current testing.
    router.push('/customer-test')
  }

  const handleLogin = async (
    email: string,
    password: string,
    tenantId: string,
    environment: 'sandbox' | 'production',
    rememberDevice: boolean
  ) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Store login data for MFA step
    setPendingLoginData({ email, tenantId, environment })
    setMfaEnvironment(environment)

    // MFA is mandatory for Production, optional for Sandbox
    if (environment === 'production') {
      setAuthStep('mfa')
    } else {
      // For sandbox, skip MFA for demo (in production, this would be configurable)
      completeLogin(email, tenantId)
    }
  }

  const handleMFA = async (code: string) => {
    if (!pendingLoginData) return

    // Simulate MFA verification
    await new Promise(resolve => setTimeout(resolve, 500))

    // In production, verify TOTP code here
    if (code.length !== 6) {
      throw new Error('Invalid verification code')
    }

    completeLogin(pendingLoginData.email, pendingLoginData.tenantId)
  }

  const completeLogin = (email: string, tenantId: string) => {
    setCurrentUser({
      id: 'user_1',
      email: email,
      role: 'CUSTOMER_USER',
      tenant: tenantId,
      name: 'Customer User',
    })
    setCurrentRole('CUSTOMER_USER')

    router.push('/customer-test')
  }

  const handleLoginClick = () => {
    setAuthStep('login')
    setPendingLoginData(null)
  }

  const handleSignUpClick = () => {
    setAuthStep('signup')
    setPendingLoginData(null)
  }

  const handleForgotPassword = () => {
    // TODO: Implement forgot password flow
    console.log('Forgot password clicked')
  }

  return (
    <DarkLoginLayout
      logoText="ZORD"
      tagline="Ingesting Data, Creating Evidence"
      backToWebsiteLink="/"
    >
      <div>
        {authStep === 'mfa' ? (
          <>
            <MFAForm
              onSubmit={handleMFA}
              onBack={handleLoginClick}
              environment={mfaEnvironment}
              mfaMethod="totp"
            />
          </>
        ) : authStep === 'login' ? (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">Sign in to Zord</h1>
            <p className="text-gray-400 mb-8">
              Don&apos;t have an account?{' '}
              <button
                onClick={handleSignUpClick}
                className="text-purple-500 hover:text-purple-400 underline"
              >
                Request access
              </button>
            </p>
            <LoginFormDark
              onSubmit={handleLogin}
              onSignUpClick={handleSignUpClick}
              onForgotPassword={handleForgotPassword}
              emailPlaceholder="name@company.com"
            />
          </>
        ) : (
          <>
            <div className="mb-6">
              <ZordLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Create an account</h1>
            <p className="text-gray-400 mb-8">
              Already have an account?{' '}
              <button
                onClick={handleLoginClick}
                className="text-purple-500 hover:text-purple-400 underline"
              >
                Log in
              </button>
            </p>
            <SignUpFormMultiStep onSubmit={handleSignUp} onLoginClick={handleLoginClick} />
          </>
        )}
      </div>
    </DarkLoginLayout>
  )
}
