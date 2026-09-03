'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface LoginLayoutProps {
  children: ReactNode
  leftContent: {
    tagline: string
    headline: string
    description?: string
  }
  logoText: string
  signUpLink?: string
  heroImageSrc?: string
  heroImageAlt?: string
}

export function LoginLayout({ 
  children, 
  leftContent, 
  logoText, 
  signUpLink,
  heroImageSrc = '/login/login-hero.png',
  heroImageAlt = 'Professional woman using holographic financial control plane interface'
}: LoginLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left Section - Dark Theme */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
        
        <div className="relative z-10 flex flex-col justify-between p-8 lg:p-12 text-white h-full">
          <div className="flex-shrink-0">
            <p className="text-sm text-gray-400 mb-6 lg:mb-8">{leftContent.tagline}</p>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 leading-tight">{leftContent.headline}</h1>
            {leftContent.description && (
              <p className="text-base lg:text-lg text-gray-300 mt-4">{leftContent.description}</p>
            )}
          </div>
          
          {/* Hero Image - Woman with Holographic Interface */}
          {heroImageSrc && (
            <div className="flex-1 flex items-center justify-center my-8 lg:my-12">
              <div className="relative w-full max-w-2xl aspect-[4/5] lg:aspect-[3/4]">
                <Image
                  src={heroImageSrc}
                  alt={heroImageAlt}
                  fill
                  className="object-contain object-center rounded-lg"
                  priority
                  quality={90}
                  sizes="(max-width: 1024px) 0vw, 50vw"
                />
              </div>
            </div>
          )}
          
          {/* Zord Logo/Brand */}
          <div className="flex-shrink-0 flex items-center justify-end mt-4 lg:mt-8">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg lg:text-xl">Z</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Section - Light Theme */}
      <div className="w-full lg:w-1/2 flex flex-col bg-white">
        <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-8 lg:px-12 lg:py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 lg:mb-12">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-base sm:text-lg">Z</span>
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">{logoText}</span>
            </div>
            {signUpLink && (
              <Link href={signUpLink} className="hidden sm:flex items-center space-x-2 text-gray-600 hover:text-gray-900">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-medium">Sign Up</span>
              </Link>
            )}
          </div>

          {/* Login Form */}
          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Sign In</h2>
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 sm:py-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          <p className="text-xs sm:text-sm text-gray-500">©2005-2025 Zord Inc.</p>
          <div className="flex items-center space-x-4">
            <Link href="#" className="text-xs sm:text-sm text-gray-500 hover:text-gray-900">Contact Us</Link>
            <div className="flex items-center space-x-1">
              <span className="text-xs sm:text-sm text-gray-500">English</span>
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
