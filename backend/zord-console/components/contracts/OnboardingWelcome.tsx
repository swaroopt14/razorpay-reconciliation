'use client'

import { useState } from 'react'

interface OnboardingWelcomeProps {
  onSelectOption: (option: 'default' | 'fresh' | 'ai') => void
}

export function OnboardingWelcome({ onSelectOption }: OnboardingWelcomeProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)

  return (
    <div className="h-full flex items-center justify-center bg-gray-50 py-12 px-8">
      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-normal text-gray-900 mb-3">
            Welcome to Schema Manager
          </h1>
          <p className="text-gray-500 text-base max-w-xl mx-auto">
            Define canonical intent schemas for the Zord Vault system. Create, version, and manage the data contracts that govern your payment intents.
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          {/* Default Schema */}
          <button
            onClick={() => onSelectOption('default')}
            onMouseEnter={() => setHoveredOption('default')}
            onMouseLeave={() => setHoveredOption(null)}
            className={`relative group p-6 bg-white border rounded-lg text-left transition-all shadow-sm hover:shadow-md ${
              hoveredOption === 'default'
                ? 'border-blue-500 ring-1 ring-blue-500'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="absolute top-4 right-4">
              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                Recommended
              </span>
            </div>
            
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors ${
              hoveredOption === 'default' ? 'bg-blue-600' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${hoveredOption === 'default' ? 'text-white' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>

            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Use Default Schema
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Start with pre-loaded fields commonly used in payment intents.
            </p>

            <div className="space-y-1 text-xs text-gray-400">
              <p className="font-medium text-gray-500">Includes:</p>
              <ul className="pl-3 space-y-0.5">
                <li>• intent_id, amount, currency</li>
                <li>• status, beneficiary</li>
                <li>• created_at, metadata</li>
              </ul>
            </div>
          </button>

          {/* Fresh Start */}
          <button
            onClick={() => onSelectOption('fresh')}
            onMouseEnter={() => setHoveredOption('fresh')}
            onMouseLeave={() => setHoveredOption(null)}
            className={`relative group p-6 bg-white border rounded-lg text-left transition-all shadow-sm hover:shadow-md ${
              hoveredOption === 'fresh'
                ? 'border-purple-500 ring-1 ring-purple-500'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors ${
              hoveredOption === 'fresh' ? 'bg-purple-600' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${hoveredOption === 'fresh' ? 'text-white' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>

            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Start Fresh
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Build your schema from scratch with full control over every field.
            </p>

            <div className="space-y-1 text-xs text-gray-400">
              <p className="font-medium text-gray-500">Features:</p>
              <ul className="pl-3 space-y-0.5">
                <li>• Empty schema canvas</li>
                <li>• Add fields manually</li>
                <li>• Full customization</li>
              </ul>
            </div>
          </button>

          {/* AI-Assisted */}
          <button
            onClick={() => onSelectOption('ai')}
            onMouseEnter={() => setHoveredOption('ai')}
            onMouseLeave={() => setHoveredOption(null)}
            disabled
            className={`relative group p-6 bg-white border rounded-lg text-left transition-all cursor-not-allowed opacity-60 ${
              hoveredOption === 'ai'
                ? 'border-amber-500'
                : 'border-gray-200'
            }`}
          >
            <div className="absolute top-4 right-4">
              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded font-medium">
                Coming Soon
              </span>
            </div>
            
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors ${
              hoveredOption === 'ai' ? 'bg-amber-500' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${hoveredOption === 'ai' ? 'text-white' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>

            <h3 className="text-base font-semibold text-gray-900 mb-2">
              AI-Assisted Setup
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload sample payloads and let AI suggest your schema structure.
            </p>

            <div className="space-y-1 text-xs text-gray-400">
              <p className="font-medium text-gray-500">Capabilities:</p>
              <ul className="pl-3 space-y-0.5">
                <li>• Analyze sample JSON</li>
                <li>• Auto-detect types</li>
                <li>• Suggest invariants</li>
              </ul>
            </div>
          </button>
        </div>

        {/* Quick Tips */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Quick Tips</span>
          </h4>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-900 font-medium mb-1">Versions</p>
              <p className="text-gray-500 text-xs leading-relaxed">
                Create new versions to evolve your schema safely. Active versions are enforced.
              </p>
            </div>
            <div>
              <p className="text-gray-900 font-medium mb-1">Invariants</p>
              <p className="text-gray-500 text-xs leading-relaxed">
                Mark fields as immutable to prevent modification after intent creation.
              </p>
            </div>
            <div>
              <p className="text-gray-900 font-medium mb-1">Validation</p>
              <p className="text-gray-500 text-xs leading-relaxed">
                Add custom rules to ensure data consistency and business logic.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
