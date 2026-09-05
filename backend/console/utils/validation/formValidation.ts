// Form Validation Utilities

export interface ValidationResult {
  isValid: boolean
  error?: string
}

export const validators = {
  email: (value: string): ValidationResult => {
    if (!value.trim()) {
      return { isValid: false, error: 'Email is required' }
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return { isValid: false, error: 'Please enter a valid email address' }
    }
    return { isValid: true }
  },

  username: (value: string): ValidationResult => {
    if (!value.trim()) {
      return { isValid: false, error: 'Username is required' }
    }
    const usernameRegex = /^[a-zA-Z0-9_]{3,}$/
    if (!usernameRegex.test(value)) {
      return { isValid: false, error: 'Username must be at least 3 characters and contain only letters, numbers, and underscores' }
    }
    return { isValid: true }
  },

  password: (value: string, minLength: number = 6): ValidationResult => {
    if (!value) {
      return { isValid: false, error: 'Password is required' }
    }
    if (value.length < minLength) {
      return { isValid: false, error: `Password must be at least ${minLength} characters` }
    }
    return { isValid: true }
  },

  required: (value: string, fieldName: string = 'Field'): ValidationResult => {
    if (!value || !value.trim()) {
      return { isValid: false, error: `${fieldName} is required` }
    }
    return { isValid: true }
  },

  name: (value: string, fieldName: string = 'Name'): ValidationResult => {
    if (!value.trim()) {
      return { isValid: false, error: `${fieldName} is required` }
    }
    if (value.length < 2) {
      return { isValid: false, error: `${fieldName} must be at least 2 characters` }
    }
    return { isValid: true }
  },
} as const

export function validateForm<T extends Record<string, string>>(
  data: T,
  rules: Record<keyof T, (value: string) => ValidationResult>
): { isValid: boolean; errors: Partial<Record<keyof T, string>> } {
  const errors: Partial<Record<keyof T, string>> = {}
  let isValid = true

  for (const [field, validator] of Object.entries(rules)) {
    const result = validator(data[field as keyof T])
    if (!result.isValid) {
      errors[field as keyof T] = result.error
      isValid = false
    }
  }

  return { isValid, errors }
}
