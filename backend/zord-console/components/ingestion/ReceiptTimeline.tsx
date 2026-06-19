'use client'

import { ReceiptStatus, ReceiptTimelineEvent } from '@/types/receipt'
import { format } from 'date-fns'
import clsx from 'clsx'

interface ReceiptTimelineProps {
  receiptId: string
  status: ReceiptStatus
  receivedAt: string
  events?: ReceiptTimelineEvent[]
}

export function ReceiptTimeline({ receiptId, status, receivedAt, events }: ReceiptTimelineProps) {
  const statusOrder: ReceiptStatus[] = ['RECEIVED', 'RAW_STORED', 'VALIDATING', 'CANONICALIZED', 'FAILED']
  const currentIndex = statusOrder.indexOf(status)

  const defaultEvents: ReceiptTimelineEvent[] = [
    { status: 'RECEIVED', timestamp: receivedAt },
    ...(status !== 'RECEIVED' ? [{ status: 'RAW_STORED' as const, timestamp: new Date(new Date(receivedAt).getTime() + 1000).toISOString() }] : []),
    ...(status === 'VALIDATING' || status === 'CANONICALIZED' || status === 'FAILED' 
      ? [{ status: 'VALIDATING' as const, timestamp: new Date(new Date(receivedAt).getTime() + 2000).toISOString() }] 
      : []),
    ...(status === 'CANONICALIZED' 
      ? [{ status: 'CANONICALIZED' as const, timestamp: new Date(new Date(receivedAt).getTime() + 3000).toISOString() }] 
      : []),
    ...(status === 'FAILED' 
      ? [{ status: 'FAILED' as const, timestamp: new Date(new Date(receivedAt).getTime() + 3000).toISOString() }] 
      : []),
  ]
  const timelineEvents = events || defaultEvents

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Status Timeline</h3>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-6">
          {timelineEvents.map((event, index) => {
            const eventIndex = statusOrder.indexOf(event.status)
            const isCompleted = eventIndex <= currentIndex
            const isCurrent = eventIndex === currentIndex && status !== 'CANONICALIZED' && status !== 'FAILED'
            const isTerminal = status === 'CANONICALIZED' || status === 'FAILED'

            return (
              <div key={event.status} className="relative flex items-start">
                <div
                  className={clsx(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2',
                    isCompleted && !isCurrent
                      ? 'bg-green-500 border-green-500'
                      : isCurrent && !isTerminal
                      ? 'bg-yellow-500 border-yellow-500'
                      : 'bg-white border-gray-300'
                  )}
                >
                  {isCompleted && !isCurrent && (
                    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {isCurrent && !isTerminal && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="ml-4 flex-1 pb-6">
                  <p className={clsx('text-sm font-medium', isCompleted ? 'text-gray-900' : 'text-gray-500')}>
                    {event.status.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(event.timestamp), 'HH:mm:ss')}
                  </p>
                  {event.message && (
                    <p className="mt-1 text-xs text-gray-600">{event.message}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
