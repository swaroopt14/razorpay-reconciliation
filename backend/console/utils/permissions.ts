import { UserRole } from '@/types/auth'

export function canViewEvidence(role: UserRole): boolean {
  return ['CUSTOMER_USER', 'CUSTOMER_ADMIN', 'OPS', 'ADMIN'].includes(role)
}

export function canRetry(role: UserRole): boolean {
  return ['OPS', 'ADMIN'].includes(role)
}

export function canDownloadEvidence(role: UserRole): boolean {
  return ['OPS', 'ADMIN'].includes(role)
}

export function canAccessInbox(role: UserRole): boolean {
  return ['CUSTOMER_ADMIN', 'OPS', 'ADMIN'].includes(role)
}

export function canAccessMonitor(role: UserRole): boolean {
  return ['OPS', 'ADMIN'].includes(role)
}

export function canAccessDLQ(role: UserRole): boolean {
  return ['OPS', 'ADMIN'].includes(role)
}

export function canReUpload(role: UserRole): boolean {
  return ['CUSTOMER_ADMIN', 'OPS', 'ADMIN'].includes(role)
}
