export type UserRole = 'CUSTOMER_USER' | 'CUSTOMER_ADMIN' | 'OPS' | 'ADMIN'

export interface User {
  id: string
  email: string
  role: UserRole
  tenant?: string
  tenantId?: string
  tenantName?: string
  workspaceCode?: string
  name: string
  mfaEnabled?: boolean
  sessionExpiresAt?: string
  idleExpiresAt?: string
  absoluteExpiresAt?: string
}

