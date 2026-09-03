'use client'

import { Receipt } from '@/types/receipt'

interface ErrorExplanationBoxProps {
  receipt: Receipt
}

export function ErrorExplanationBox({ receipt }: ErrorExplanationBoxProps) {
  if (!receipt.error || receipt.status !== 'FAILED') {
    return null
  }

  const errorMessages: Record<string, string> = {
    MISSING_FIELD: 'A required field is missing from the data.',
    INVALID_VALUE: 'A field contains an invalid value.',
    UNSUPPORTED_FORMAT: 'The data format is not supported.',
    POLICY_RESTRICTION: 'The data violates a policy restriction.',
  }

  const errorMessage = receipt.errorType 
    ? errorMessages[receipt.errorType] || 'An error occurred during processing.'
    : 'An error occurred during processing.'

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start">
        <svg className="h-5 w-5 text-red-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 mb-1">Processing Failed</h3>
          <p className="text-sm text-red-800 mb-2">{errorMessage}</p>
          <p className="text-xs text-red-700 font-mono bg-red-100 px-2 py-1 rounded">
            {receipt.error}
          </p>
        </div>
      </div>
    </div>
  )
}
