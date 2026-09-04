'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { type OverviewData } from '@/services/api'

type ServiceStatus = 'available' | 'coming-soon' | 'partial'

interface Service {
  id: string
  name: string
  description: string
  category: string
  status: ServiceStatus
  href: string
  icon?: string
}

const services: Service[] = [
  {
    id: 'ingestion',
    name: 'Ingestion',
    description: 'Accept, normalize, and persist financial intents',
    category: 'Ingestion & Intake',
    status: 'available',
    href: '/console/ingestion',
  },
  {
    id: 'acc',
    name: 'ACC',
    description: 'Automated Compliance & Controls',
    category: 'Compliance & Controls',
    status: 'coming-soon',
    href: '#',
  },
  {
    id: 'pdr',
    name: 'PDR',
    description: 'Payment Decisioning & Routing',
    category: 'Decisioning & Routing',
    status: 'coming-soon',
    href: '#',
  },
  {
    id: 'execution',
    name: 'Execution',
    description: 'Payment execution & bank connectivity',
    category: 'Execution & Settlement',
    status: 'coming-soon',
    href: '#',
  },
  {
    id: 'evidence',
    name: 'Evidence',
    description: 'Audit trails & regulatory proof',
    category: 'Evidence & Audit',
    status: 'partial',
    href: '/console/ingestion/evidence',
  },
]

// Helper functions
function getRecentlyUsed(): string[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('zord-recently-used')
  if (!stored) return ['ingestion']
  try {
    return JSON.parse(stored)
  } catch {
    return ['ingestion']
  }
}

function saveRecentlyUsed(serviceId: string) {
  if (typeof window === 'undefined') return
  const recent = getRecentlyUsed()
  const updated = [serviceId, ...recent.filter(id => id !== serviceId)].slice(0, 12)
  localStorage.setItem('zord-recently-used', JSON.stringify(updated))
}

// Card Components with professional styling
function RecentlyVisitedCard({ services, recentlyUsedServices }: { services: Service[]; recentlyUsedServices: Service[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-sm font-bold text-gray-900">Recently visited</h2>
          <Link
            href="#"
            className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-normal"
            title="Learn more about recently visited services"
          >
            Info
          </Link>
        </div>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
          aria-label="More options"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div className="p-6">
        {recentlyUsedServices.length > 0 ? (
          <>
            <div className="space-y-3">
              {recentlyUsedServices.slice(0, 6).map(service => (
                <Link
                  key={service.id}
                  href={service.href}
                  onClick={() => saveRecentlyUsed(service.id)}
                  className="flex items-center space-x-3 p-2.5 rounded-md hover:bg-gray-50 transition-colors group"
                >
                  <div
                    className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 shadow-sm ${
                      service.id === 'ingestion'
                        ? 'bg-blue-100'
                        : service.id === 'evidence'
                          ? 'bg-yellow-100'
                          : 'bg-gray-100'
                    }`}
                  >
                    {service.id === 'ingestion' ? (
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {service.name}
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-200">
              <Link
                href="/console"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 group"
              >
                <span>View all services</span>
                <svg
                  className="w-4 h-4 transform group-hover:translate-y-[-2px] transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No recently visited services</p>
            <p className="text-xs text-gray-500 mb-4">Explore one of these commonly used services:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {services
                .filter(s => s.status === 'available')
                .slice(0, 3)
                .map(service => (
                  <Link
                    key={service.id}
                    href={service.href}
                    onClick={() => saveRecentlyUsed(service.id)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    {service.name}
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SystemHealthCard({ overviewData, loading }: { overviewData: OverviewData | null; loading: boolean }) {
  const health = overviewData?.health ?? []
  const healthyComponents = health.filter(h => h.status === 'HEALTHY').length
  const totalComponents = health.length
  const healthScore = totalComponents > 0 ? Math.round((healthyComponents / totalComponents) * 100) : 100
  const criticalFindings = health.filter(h => h.status === 'UNHEALTHY').length
  const degradedFindings = health.filter(h => h.status === 'DEGRADED').length
  const lastUpdated = overviewData?.evidence?.last_write
    ? new Date(overviewData.evidence.last_write).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '-'

  const scoreColor = healthScore >= 90 ? 'text-green-600' : healthScore >= 70 ? 'text-yellow-600' : 'text-orange-600'

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">System Health</h2>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
          aria-label="More options"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5">
        <div className="text-xs font-medium text-gray-500 mb-4 uppercase tracking-wide">Region: Asia Pacific (Mumbai)</div>
        {loading ? (
          <div className="text-center py-10">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-gray-200 border-t-blue-600"></div>
          </div>
        ) : overviewData ? (
          <>
            <div className="mb-5">
              <div className="flex items-baseline space-x-3 mb-2">
                <span className={`text-5xl font-bold ${scoreColor}`}>{healthScore}%</span>
                <Link
                  href="/console/ingestion"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Details
                </Link>
              </div>
              <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Health score</div>
            </div>
            <div className="space-y-2.5 mb-5">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-gray-700">Failed components</span>
                <span className="text-sm font-semibold text-gray-900">
                  {criticalFindings}/{totalComponents}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-gray-700">Critical severity findings</span>
                <span className="text-sm font-semibold text-gray-900">{criticalFindings}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-gray-700">Degraded components</span>
                <span className="text-sm font-semibold text-gray-900">{degradedFindings}</span>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-gray-500 mb-5 pb-4 border-b border-gray-200">
              <div>Scope: This account, All linked Regions</div>
              <div className="font-mono">Last updated: {lastUpdated}</div>
            </div>
            <div>
              <Link
                href="/console/ingestion"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 group"
              >
                <span>Go to Ingestion Health</span>
                <svg
                  className="w-4 h-4 transform group-hover:translate-y-[-2px] transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500">Unable to load health data</p>
          </div>
        )}
      </div>
    </div>
  )
}

function WelcomeCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Welcome to Zord</h2>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
          aria-label="More options"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div className="p-6">
        <div className="space-y-5">
          <Link href="/console/ingestion" className="flex items-start group">
            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-gray-200 transition-colors shadow-sm">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 group-hover:underline flex items-center space-x-1.5 mb-1">
                <span>Getting started with Zord</span>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
              <div className="text-xs text-gray-600 leading-relaxed">
                Learn the fundamentals and find valuable information to get the most out of Zord.
              </div>
            </div>
          </Link>
          <Link href="/console/ingestion/intents" className="flex items-start group">
            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-gray-200 transition-colors shadow-sm">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 group-hover:underline flex items-center space-x-1.5 mb-1">
                <span>Training and certification</span>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
              <div className="text-xs text-gray-600 leading-relaxed">
                Learn from Zord experts and advance your skills and knowledge.
              </div>
            </div>
          </Link>
          <Link href="/console/ingestion/stream-consumers" className="flex items-start group">
            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4 group-hover:bg-gray-200 transition-colors shadow-sm">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-blue-600 group-hover:text-blue-700 group-hover:underline flex items-center space-x-1.5 mb-1">
                <span>What&apos;s new with Zord?</span>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
              <div className="text-xs text-gray-600 leading-relaxed">
                Discover new Zord services, features, and Regions.
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

function CostAndUsageCard({ overviewData }: { overviewData: OverviewData | null }) {
  const currentMonthCost = 125.79
  const forecastedMonthEnd = 244.06
  const lastMonthCost = 141.34
  const currentMonthChange = ((currentMonthCost - lastMonthCost) / lastMonthCost) * 100
  const forecastChange = ((forecastedMonthEnd - lastMonthCost * 2) / (lastMonthCost * 2)) * 100

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Cost and usage</h2>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
          aria-label="More options"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div className="p-6">
        <div className="space-y-6">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Current month costs</div>
            <div className="flex items-baseline space-x-3">
              <span className="text-3xl font-bold text-gray-900">${currentMonthCost.toFixed(2)}</span>
              <span
                className={`text-sm font-semibold ${
                  currentMonthChange < 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {currentMonthChange < 0 ? 'down' : 'up'} {Math.abs(currentMonthChange).toFixed(0)}% over last month
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Forecasted month end costs</div>
            <div className="flex items-baseline space-x-3">
              <span className="text-3xl font-bold text-gray-900">${forecastedMonthEnd.toFixed(2)}</span>
              <span
                className={`text-sm font-semibold ${
                  forecastChange < 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {forecastChange < 0 ? 'down' : 'up'} {Math.abs(forecastChange).toFixed(0)}% over last month
              </span>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Savings opportunities</div>
            <button className="w-full px-4 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors">
              Enable Cost Optimization Hub
            </button>
          </div>
          <div>
            <Link
              href="#"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 group"
            >
              <span>Go to Cost Management</span>
              <svg
                className="w-4 h-4 transform group-hover:translate-y-[-2px] transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZordHealthCard({ overviewData }: { overviewData: OverviewData | null }) {
  const health = overviewData?.health ?? []
  const openIssues = health.filter(h => h.status === 'UNHEALTHY' || h.status === 'DEGRADED').length
  const scheduledChanges = 0
  const otherNotifications = 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Zord Health</h2>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
          aria-label="More options"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div className="p-6">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-gray-700">Open issues</span>
              <span className="text-2xl font-bold text-gray-900">{openIssues}</span>
            </div>
            <div className="text-xs text-gray-500">Past 7 days</div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-gray-700">Scheduled changes</span>
              <span className="text-2xl font-bold text-gray-900">{scheduledChanges}</span>
            </div>
            <div className="text-xs text-gray-500">Upcoming and past 7 days</div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-gray-700">Other notifications</span>
              <span className="text-2xl font-bold text-gray-900">{otherNotifications}</span>
            </div>
            <div className="text-xs text-gray-500">Past 7 days</div>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <Link
              href="/console/ingestion"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1.5 group"
            >
              <span>Go to Zord Health</span>
              <svg
                className="w-4 h-4 transform group-hover:translate-y-[-2px] transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ConsoleHomePage() {
  const router = useRouter()
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/prod/overview')
      if (!response.ok) {
        throw new Error(`Failed to fetch overview: ${response.status}`)
      }
      const data: OverviewData = await response.json()
      setOverviewData(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('[ConsoleHome] Failed to load overview:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    setMounted(true)
    setRecentlyUsed(getRecentlyUsed())
    loadOverview()
  }, [router, loadOverview])

  const recentlyUsedServices = recentlyUsed
    .map(id => services.find(s => s.id === id))
    .filter((s): s is Service => s !== undefined)
    .slice(0, 12)

  if (!mounted) {
    return (
      <Layout serviceName="" breadcrumbs={[]}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading console...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="" breadcrumbs={[]}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-normal text-gray-900">Console Home</h1>
            <Link
              href="#"
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-normal"
              title="Learn more about Console Home"
            >
              Info
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <button
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
              title="Reset to default layout"
            >
              Reset to default layout
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-orange-600 rounded-md hover:bg-orange-700 transition-colors flex items-center space-x-2 shadow-sm"
              title="Add widgets to customize your console home"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add widgets</span>
            </button>
          </div>
        </div>

        {/* Main Widget Layout */}
        <div className="space-y-6">
          {/* Top Row: 2 Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentlyVisitedCard services={services} recentlyUsedServices={recentlyUsedServices} />
            <SystemHealthCard overviewData={overviewData} loading={loading} />
          </div>

          {/* Middle Row: 1 Wide Card */}
          <div>
            <WelcomeCard />
          </div>

          {/* Bottom Row: 2 Cards (50% each) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CostAndUsageCard overviewData={overviewData} />
            <ZordHealthCard overviewData={overviewData} />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-400 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Failed to load overview data</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
                <button
                  onClick={loadOverview}
                  className="mt-3 text-xs font-medium text-red-600 hover:text-red-800 underline"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
