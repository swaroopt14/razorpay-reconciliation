// Types for Canonical Schema & Contract Manager

export type FieldType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'date'
  | 'email'
  | 'url'
  | 'enum'
  | 'object'
  | 'array'

export type VersionStatus = 'draft' | 'active' | 'deprecated'

export type InvariantType = 'immutable' | 'validation' | 'condition'

export interface FieldDefinition {
  id: string
  name: string
  type: FieldType
  required: boolean
  description: string
  default?: string
  isInvariant?: boolean
  order: number
  enumValues?: string[]
  nestedFields?: FieldDefinition[] // For object/array types
}

export interface InvariantRule {
  id: string
  type: InvariantType
  fieldName?: string
  expression?: string
  operator?: string
  value?: string | number
  errorMessage?: string
  enabled: boolean
}

export interface ChangeEntry {
  id: string
  timestamp: string
  author: string
  action: 'created' | 'modified' | 'published' | 'deprecated' | 'field_added' | 'field_removed' | 'field_modified'
  description: string
  fieldName?: string
  previousValue?: string
  newValue?: string
}

export interface SchemaVersion {
  id: string
  contractId: string
  versionNumber: number
  versionLabel: string // "v0", "v1", "v2"
  status: VersionStatus
  fields: FieldDefinition[]
  invariants: InvariantRule[]
  createdAt: string
  createdBy: string
  publishedAt?: string
  publishedBy?: string
  lastModified?: string
  modifiedBy?: string
  changelog: ChangeEntry[]
  usedByCount?: number // For deprecation warnings
}

export interface Contract {
  id: string
  name: string // e.g., "CONTRACT_PAYOUT"
  description: string
  createdAt: string
  createdBy: string
  versions: SchemaVersion[]
  activeVersionId?: string
}

// API Response types
export interface ContractListResponse {
  items: Contract[]
  total: number
}

export interface ContractDetailResponse {
  contract: Contract
  version: SchemaVersion
}

// Validation result types
export interface ValidationResult {
  valid: boolean
  fieldCount: number
  requiredFields: number
  immutableFields: number
  validationRules: number
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field?: string
  rule?: string
  message: string
}

export interface ValidationWarning {
  field?: string
  message: string
}

// Default fields template
export const DEFAULT_FIELDS: FieldDefinition[] = [
  {
    id: 'field_intent_id',
    name: 'intent_id',
    type: 'string',
    required: true,
    description: 'Unique identifier for payment intent',
    order: 0,
  },
  {
    id: 'field_amount',
    name: 'amount',
    type: 'number',
    required: true,
    description: 'Payout amount in minor units',
    isInvariant: true,
    order: 1,
  },
  {
    id: 'field_currency',
    name: 'currency',
    type: 'string',
    required: true,
    description: 'ISO 4217 currency code',
    isInvariant: true,
    order: 2,
  },
  {
    id: 'field_status',
    name: 'status',
    type: 'enum',
    required: true,
    description: 'Current intent status',
    enumValues: ['pending', 'submitted', 'succeeded', 'failed', 'cancelled'],
    order: 3,
  },
  {
    id: 'field_beneficiary',
    name: 'beneficiary',
    type: 'object',
    required: true,
    description: 'Beneficiary account details',
    isInvariant: true,
    order: 4,
  },
  {
    id: 'field_created_at',
    name: 'created_at',
    type: 'datetime',
    required: true,
    description: 'Creation timestamp',
    order: 5,
  },
  {
    id: 'field_metadata',
    name: 'metadata',
    type: 'object',
    required: false,
    description: 'Custom metadata object',
    order: 6,
  },
]

// Default invariants
export const DEFAULT_INVARIANTS: InvariantRule[] = [
  {
    id: 'inv_amount_positive',
    type: 'validation',
    fieldName: 'amount',
    operator: '>=',
    value: 0,
    expression: 'amount >= 0',
    errorMessage: 'Amount must be non-negative',
    enabled: true,
  },
  {
    id: 'inv_currency_format',
    type: 'validation',
    fieldName: 'currency',
    expression: 'currency.length === 3',
    errorMessage: 'Currency must be a 3-letter ISO code',
    enabled: true,
  },
  {
    id: 'inv_status_valid',
    type: 'validation',
    fieldName: 'status',
    expression: '["pending", "submitted", "succeeded", "failed", "cancelled"].includes(status)',
    errorMessage: 'Invalid status value',
    enabled: true,
  },
]

// Field type options for dropdowns
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string; description: string }[] = [
  { value: 'string', label: 'String', description: 'Text value' },
  { value: 'number', label: 'Number', description: 'Numeric value (integer or decimal)' },
  { value: 'boolean', label: 'Boolean', description: 'True or false' },
  { value: 'datetime', label: 'DateTime', description: 'ISO 8601 timestamp' },
  { value: 'date', label: 'Date', description: 'Date without time' },
  { value: 'email', label: 'Email', description: 'Email address format' },
  { value: 'url', label: 'URL', description: 'Valid URL format' },
  { value: 'enum', label: 'Enum', description: 'One of predefined values' },
  { value: 'object', label: 'Object', description: 'Nested object structure' },
  { value: 'array', label: 'Array', description: 'List of values' },
]

// Validation rule templates
export const RULE_TEMPLATES = [
  { label: 'Positive Number', expression: '{field} >= 0', description: 'Value must be non-negative' },
  { label: 'Required Length', expression: '{field}.length >= {min} && {field}.length <= {max}', description: 'String length constraints' },
  { label: 'Enum Value', expression: '[{values}].includes({field})', description: 'Value must be in list' },
  { label: 'Regex Match', expression: '/{pattern}/.test({field})', description: 'Match regex pattern' },
  { label: 'Not Empty', expression: '{field} !== "" && {field} !== null', description: 'Value must not be empty' },
  { label: 'Future Date', expression: 'new Date({field}) > new Date()', description: 'Date must be in future' },
  { label: 'Past Date', expression: 'new Date({field}) < new Date()', description: 'Date must be in past' },
]
