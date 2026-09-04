import { NextRequest, NextResponse } from 'next/server'
import { SchemaDetail, BreakingChange } from '@/types/validation'

export const dynamic = 'force-dynamic'

// Generate mock schema content based on schema name
function generateSchemaContent(schemaName: string): object {
  if (schemaName.includes('payout')) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://zord.arealis.io/schemas/${schemaName}`,
      type: 'object',
      required: ['amount', 'currency', 'beneficiary', 'constraints'],
      properties: {
        amount: {
          type: 'number',
          minimum: 0.01,
          description: 'Transaction amount in minor units',
        },
        currency: {
          type: 'string',
          enum: ['INR', 'USD', 'EUR'],
          description: 'ISO 4217 currency code',
        },
        beneficiary: {
          type: 'object',
          required: ['account_number', 'ifsc', 'name'],
          properties: {
            account_number: {
              type: 'string',
              minLength: 9,
              maxLength: 18,
              pattern: '^[0-9]+$',
            },
            ifsc: {
              type: 'string',
              pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
            },
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
            },
            bank_name: {
              type: 'string',
            },
          },
        },
        constraints: {
          type: 'object',
          properties: {
            deadline_at: {
              type: 'string',
              format: 'date-time',
            },
            priority: {
              type: 'string',
              enum: ['LOW', 'NORMAL', 'HIGH'],
            },
          },
        },
        purpose: {
          type: 'string',
          enum: ['SALARY', 'VENDOR_PAYMENT', 'REFUND', 'OTHER'],
        },
        reference_id: {
          type: 'string',
          maxLength: 64,
        },
        metadata: {
          type: 'object',
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    }
  }

  if (schemaName.includes('refund')) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://zord.arealis.io/schemas/${schemaName}`,
      type: 'object',
      required: ['original_transaction_id', 'amount', 'currency', 'reason'],
      properties: {
        original_transaction_id: { type: 'string' },
        amount: { type: 'number', minimum: 0.01 },
        currency: { type: 'string', enum: ['INR', 'USD', 'EUR'] },
        reason: { type: 'string', maxLength: 500 },
        beneficiary: {
          type: 'object',
          properties: {
            account_number: { type: 'string' },
            ifsc: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    }
  }

  if (schemaName.includes('transfer')) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://zord.arealis.io/schemas/${schemaName}`,
      type: 'object',
      required: ['amount', 'currency', 'source_account', 'destination_account', 'transfer_type'],
      properties: {
        amount: { type: 'number', minimum: 0.01 },
        currency: { type: 'string' },
        source_account: { type: 'object' },
        destination_account: { type: 'object' },
        transfer_type: { type: 'string', enum: ['IMPS', 'NEFT', 'RTGS', 'UPI'] },
      },
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
  }
}

// Generate breaking changes based on schema
function generateBreakingChanges(schemaName: string, isLegacy: boolean): BreakingChange[] {
  if (!isLegacy) {
    return []
  }

  const changes: BreakingChange[] = [
    {
      field: 'beneficiary.bank_ifsc',
      change_type: 'required → optional',
      impact: 'Legacy clients may fail validation if they rely on implicit IFSC lookup',
    },
  ]

  if (schemaName.includes('transfer')) {
    changes.push({
      field: 'amount.precision',
      change_type: '4 decimals → 2 decimals',
      impact: 'High-precision amounts will be truncated',
    })
  }

  return changes
}

// Get required fields based on schema
function getRequiredFields(schemaName: string): string[] {
  if (schemaName.includes('payout')) {
    return ['amount', 'currency', 'beneficiary', 'constraints.deadline_at']
  }
  if (schemaName.includes('refund')) {
    return ['original_transaction_id', 'amount', 'currency', 'reason']
  }
  if (schemaName.includes('transfer')) {
    return ['amount', 'currency', 'source_account', 'destination_account', 'transfer_type']
  }
  return ['amount', 'currency']
}

// Get intent type from schema name
function getIntentType(schemaName: string): string {
  if (schemaName.includes('payout')) return 'PAYOUT'
  if (schemaName.includes('refund')) return 'REFUND'
  if (schemaName.includes('transfer')) return 'TRANSFER'
  if (schemaName.includes('settlement')) return 'SETTLEMENT'
  if (schemaName.includes('batch')) return 'BATCH_PAYOUT'
  return 'GENERIC'
}

// Get service that uses this schema
function getUsedByService(schemaName: string): string {
  if (schemaName.includes('payout') || schemaName.includes('refund') || schemaName.includes('transfer')) {
    return 'zord-intent-engine'
  }
  if (schemaName.includes('batch')) return 'zord-batch-processor'
  if (schemaName.includes('webhook')) return 'zord-edge'
  if (schemaName.includes('settlement')) return 'zord-settlement-engine'
  if (schemaName.includes('audit')) return 'zord-audit-logger'
  if (schemaName.includes('compliance')) return 'zord-compliance-engine'
  if (schemaName.includes('kyc')) return 'zord-kyc-service'
  return 'zord-intent-engine'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schema_name: string; version: string }> }
) {
  const { schema_name, version } = await params

  const isLegacy = schema_name.includes('legacy')
  const format = schema_name.includes('refund') || schema_name.includes('audit')
    ? 'AVRO'
    : schema_name.includes('kyc') || (schema_name.includes('legacy') && schema_name.includes('transfer'))
    ? 'PROTOBUF'
    : 'JSON_SCHEMA'

  const breakingChanges = generateBreakingChanges(schema_name, isLegacy)
  const requiredFields = getRequiredFields(schema_name)

  const schemaDetail: SchemaDetail = {
    // Basic Info
    schema_name,
    version,
    format,
    status: isLegacy ? 'DEPRECATED' : 'ACTIVE',
    used_by: getUsedByService(schema_name),
    created_at: '2026-01-13T10:42:00Z',
    updated_at: '2026-01-28T09:15:00Z',

    // Version Metadata
    canonical_version: 'zintent.v1',
    hash: '91fa0c3e' + Math.random().toString(36).substring(2, 10),
    schema_format_version: format === 'JSON_SCHEMA' ? 'JSON Schema v7' : format === 'AVRO' ? 'Avro 1.11' : 'Protobuf 3',
    description: `Canonical schema for ${schema_name.replace('.', ' ')} operations. Defines the structure and validation rules enforced at ingestion.`,
    created_by: 'platform_admin',

    // Usage & Enforcement
    used_by_service: getUsedByService(schema_name),
    enforced_at_stage: 'SCHEMA_VALIDATION',
    active_tenants: isLegacy ? 0 : Math.floor(Math.random() * 5) + 1,
    intents_validated: isLegacy ? 0 : Math.floor(Math.random() * 50000) + 10000,
    failures_24h: isLegacy ? 0 : Math.floor(Math.random() * 50) + 5,

    // Canonical Mapping
    intent_type: getIntentType(schema_name),
    maps_to_table: 'payment_intents',
    required_fields: requiredFields,

    // Schema Content
    schema_content: generateSchemaContent(schema_name),

    // Compatibility & Evolution
    compatibility: {
      backward_compatible: !isLegacy,
      forward_compatible: !isLegacy,
      breaking_changes_count: breakingChanges.length,
      breaking_changes: breakingChanges,
    },

    // Enforcement & Failure Impact
    enforcement: {
      validation_stage: 'PRE-ACC',
      on_failure_actions: [
        'Reject intent',
        'Persist envelope',
        'Create DLQ item',
        'Evidence receipt generated',
      ],
      dlq_stage_code: 'SCHEMA_VALIDATION',
      dlq_reason_codes: ['INVALID_FIELD', 'MISSING_FIELD', 'SCHEMA_MISMATCH'],
      envelope_parse_status: 'FAILED_VALIDATION',
    },

    // Audit & Evidence
    audit: {
      schema_immutable: true,
      changes_allowed_in_prod: false,
      evidence_stored: true,
      evidence_type: 'SCHEMA_SNAPSHOT',
      evidence_ref: `worm://prod/schemas/${schema_name}/${version}`,
    },
  }

  return NextResponse.json(schemaDetail)
}
