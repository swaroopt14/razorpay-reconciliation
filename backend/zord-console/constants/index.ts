// Application Constants

export const APP_NAME = 'Zord Ingestion Console'
export const APP_VERSION = '1.0.0'

// API Constants
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'
export const API_TIMEOUT = 30000 // 30 seconds

// Polling Constants
export const POLLING_INTERVAL = 3000 // 3 seconds
export const POLLING_MAX_ATTEMPTS = 100

// Storage Keys
export const STORAGE_KEYS = {
  AUTH: 'zord_auth',
  CURRENT_ROLE: 'zord_current_role',
  THEME: 'zord_theme',
} as const

// Routes
export const ROUTES = {
  SIGNIN: '/signin',
  SIGNUP: '/signup',
  REGISTER: '/register',
  PAYOUT_TODAY: '/payout-command-view/today',
  SANDBOX: '/sandbox',
} as const

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to access this resource.',
  NOT_FOUND: 'Resource not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const

// Status Configurations
export const RECEIPT_STATUS_CONFIG = {
  RECEIVED: { label: 'Received', color: 'gray' },
  RAW_STORED: { label: 'Raw Stored', color: 'blue' },
  VALIDATING: { label: 'Validating', color: 'yellow' },
  CANONICALIZED: { label: 'Canonicalized', color: 'green' },
  FAILED: { label: 'Failed', color: 'red' },
} as const

// Terminal States (where polling should stop)
export const TERMINAL_STATES = ['CANONICALIZED', 'FAILED'] as const
