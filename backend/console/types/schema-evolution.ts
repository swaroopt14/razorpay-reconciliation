// Schema Evolution Types for Evolution Monitor Page

export type CompatibilityStatus = 'BREAKING' | 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE'

export interface SchemaVersion {
  version: string
  created_at: string
  compatibility: CompatibilityStatus
  backward_compatible: boolean
  forward_compatible: boolean
  deployed_to_prod: boolean
  fields_added: string[]
  fields_removed: string[]
  fields_changed: string[]
  dlq_failures_24h: number
  affected_tenants: string[]
  created_by: string
}

export interface SchemaInfo {
  schema_id: string
  schema_name: string
  display_name: string
  status: 'ACTIVE' | 'DEPRECATED' | 'DRAFT'
  current_version: string
  total_versions: number
  breaking_changes_30d: number
  dlq_failures_30d: number
  affected_tenants_30d: string[]
  last_updated: string
  owner_team: string
  versions: SchemaVersion[]
}

export interface RegistryHealth {
  total_schemas: number
  active_schemas: number
  deprecated_schemas: number
  breaking_changes_30d: number
  schemas_with_failures: number
}

export interface ChangeImpact {
  changes_30d: number
  breaking_changes_30d: number
  validations_30d: number
  failures_30d: number
  failure_rate_change_percent: number
  top_failure_schema: string
  top_failure_schema_count: number
}

export interface RecentFailure {
  failure_id: string
  timestamp: string
  schema_name: string
  schema_version: string
  reason_code: string
  error_message: string
  tenant_id: string
  tenant_name: string
  envelope_id: string
  dlq_id: string
}

export interface SchemaEvolutionResponse {
  registry_health: RegistryHealth
  change_impact: ChangeImpact
  schemas: SchemaInfo[]
  recent_failures: RecentFailure[]
}
