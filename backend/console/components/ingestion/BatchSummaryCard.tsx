'use client'

import { Batch } from '@/types/batch'
import { format } from 'date-fns'

interface BatchSummaryCardProps {
  batch: Batch
}

export function BatchSummaryCard({ batch }: BatchSummaryCardProps) {
  const successRate = batch.totalRecords > 0 
    ? ((batch.canonicalized / batch.totalRecords) * 100).toFixed(1)
    : '0'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Batch Summary</h2>
        <span className="text-sm text-gray-500">
          {format(new Date(batch.uploadedAt), 'yyyy-MM-dd HH:mm:ss')}
        </span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-gray-600">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">{batch.totalRecords}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Canonicalized</p>
          <p className="text-2xl font-bold text-green-600">{batch.canonicalized}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Failed</p>
          <p className="text-2xl font-bold text-red-600">{batch.failed}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Processing</p>
          <p className="text-2xl font-bold text-yellow-600">{batch.processing}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Success Rate</span>
          <span className="text-lg font-semibold text-gray-900">{successRate}%</span>
        </div>
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-600 h-2 rounded-full"
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>
    </div>
  )
}
