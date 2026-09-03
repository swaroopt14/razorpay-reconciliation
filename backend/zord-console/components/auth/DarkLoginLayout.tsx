'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface DarkLoginLayoutProps {
  children: ReactNode
  logoText?: string
  tagline?: string
  backToWebsiteLink?: string
  showSignUp?: boolean
  signUpLink?: string
}

export function DarkLoginLayout({
  children,
  logoText = 'ZORD',
  tagline = 'Ingesting Data, Creating Evidence',
  backToWebsiteLink = '#',
  showSignUp = false,
  signUpLink = '#',
}: DarkLoginLayoutProps) {
  return (
    <>
      <style jsx>{`
        .liquid-auth-root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #020202;
        }

        .liquid-bg-layer {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }

        .liquid-bg-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background:
            linear-gradient(180deg, rgba(4, 4, 4, 0.4), rgba(4, 4, 4, 0.78)),
            radial-gradient(circle at 18% 10%, rgba(255, 255, 255, 0.09), transparent 34%),
            radial-gradient(circle at 84% 14%, rgba(255, 255, 255, 0.12), transparent 30%),
            radial-gradient(circle at 50% 60%, transparent 38%, rgba(0, 0, 0, 0.36) 100%);
        }

        .liquid-auth-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.36'/%3E%3C/svg%3E");
          opacity: 0.03;
          mix-blend-mode: soft-light;
          z-index: 2;
        }

        .liquid-page {
          position: relative;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-height: 100vh;
          padding: 24px 44px;
        }

        .main-glass {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          width: min(860px, 62vw);
          max-width: calc(100vw - 88px);
          min-height: min(760px, calc(100vh - 64px));
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(10, 10, 10, 0.78);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow:
            0 40px 100px rgba(0, 0, 0, 0.86),
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 -1px 0 rgba(255, 255, 255, 0.04);
          padding: 62px 56px 56px;
          animation: glassEnter 0.6s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, opacity, filter;
        }

        .main-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1),
            transparent 30%,
            transparent 70%,
            rgba(255, 255, 255, 0.06)
          );
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          animation: glowIn 1s ease forwards;
          animation-delay: 0.3s;
        }

        .main-glass::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 18% 8%, rgba(255, 255, 255, 0.13), transparent 46%);
          pointer-events: none;
          z-index: 1;
          opacity: 0;
          animation: glowIn 1s ease forwards;
          animation-delay: 0.3s;
        }

        .main-glass-content {
          position: relative;
          z-index: 3;
          width: min(700px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        :global(.liquid-stagger-scope > *) {
          opacity: 0;
          transform: translateY(10px);
          animation: fadeUp 0.5s ease forwards;
        }

        :global(.liquid-stagger-scope > *:nth-child(1)) { animation-delay: 0.1s; }
        :global(.liquid-stagger-scope > *:nth-child(2)) { animation-delay: 0.2s; }
        :global(.liquid-stagger-scope > *:nth-child(3)) { animation-delay: 0.3s; }
        :global(.liquid-stagger-scope > *:nth-child(4)) { animation-delay: 0.4s; }
        :global(.liquid-stagger-scope > *:nth-child(5)) { animation-delay: 0.5s; }
        :global(.liquid-stagger-scope > *:nth-child(6)) { animation-delay: 0.6s; }

        @keyframes glassEnter {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
            filter: blur(10px);
          }
          60% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
            filter: blur(2px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes fadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes glowIn {
          to {
            opacity: 0.6;
          }
        }

        .main-close {
          position: absolute;
          right: 24px;
          top: 20px;
          z-index: 4;
          display: inline-flex;
          height: 42px;
          width: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(10, 10, 10, 0.42);
          color: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
          transition: all 0.2s ease;
        }

        .main-close:hover {
          background: rgba(24, 24, 24, 0.72);
          color: rgba(255, 255, 255, 0.9);
        }

        @media (prefers-reduced-motion: reduce) {
          .main-glass,
          .main-glass::before,
          .main-glass::after,
          :global(.liquid-stagger-scope > *) {
            animation: none !important;
            filter: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }

        @media (max-width: 980px) {
          .liquid-page {
            padding: 20px;
            justify-content: center;
          }

          .main-glass {
            width: 100%;
            max-width: 100%;
            min-height: auto;
            padding: 36px 24px 28px;
            border-radius: 20px;
          }

          .main-close {
            right: 16px;
            top: 14px;
          }
        }
      `}</style>

      <div className="liquid-auth-root">
        <div className="liquid-bg-layer">
          <Image
            src="/login/login-hero5.jpg"
            alt="Login background"
            fill
            className="object-cover"
            priority
            quality={90}
          />
          <div className="liquid-bg-overlay" />
        </div>

        <div className="liquid-auth-noise" />

        <div className="liquid-page">
          <div className="main-glass">
            <Link
              href={backToWebsiteLink}
              aria-label="Close"
              className="main-close focus:outline-none focus:ring-2 focus:ring-violet-400/70"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Link>
            <div className="main-glass-content liquid-stagger-scope">{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}
