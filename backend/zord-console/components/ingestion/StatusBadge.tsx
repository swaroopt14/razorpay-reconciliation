import { ReceiptStatus } from '@/types/receipt'
import clsx from 'clsx'

interface StatusBadgeProps {
  status: ReceiptStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig = {
    RECEIVED: { label: 'Received', color: 'text-zord-status-active border-zord-base-border' },
    RAW_STORED: { label: 'Raw Stored', color: 'text-zord-status-active border-zord-base-border' },
    VALIDATING: { label: 'Validating', color: 'text-zord-status-degraded border-zord-base-border' },
    CANONICALIZED: { label: 'Canonicalized', color: 'text-zord-status-healthy border-zord-base-border' },
    FAILED: { label: 'Failed', color: 'text-zord-status-failed border-zord-base-border' },
  }

  const config = statusConfig[status]

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border bg-transparent',
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  )
}
