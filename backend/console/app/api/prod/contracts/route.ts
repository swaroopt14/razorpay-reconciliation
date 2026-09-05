import { NextRequest, NextResponse } from 'next/server'
import { Contract, SchemaVersion, ContractListResponse, DEFAULT_FIELDS, DEFAULT_INVARIANTS } from '@/types/contract'

export const dynamic = 'force-dynamic'

// In-memory store for demo (in production, this would be a database)
let contracts: Contract[] = [
  {
    id: 'contract_payout',
    name: 'CONTRACT_PAYOUT',
    description: 'Canonical schema for payout intents',
    createdAt: '2026-01-10T10:00:00Z',
    createdBy: 'platform_admin',
    activeVersionId: 'ver_payout_v2',
    versions: [
      {
        id: 'ver_payout_v2',
        contractId: 'contract_payout',
        versionNumber: 2,
        versionLabel: 'v2',
        status: 'active',
        fields: DEFAULT_FIELDS,
        invariants: DEFAULT_INVARIANTS,
        createdAt: '2026-01-15T14:30:00Z',
        createdBy: 'platform_admin',
        publishedAt: '2026-01-16T09:00:00Z',
        publishedBy: 'platform_admin',
        changelog: [
          {
            id: 'ch_1',
            timestamp: '2026-01-16T09:00:00Z',
            author: 'platform_admin',
            action: 'published',
            description: 'Published as active version',
          },
        ],
        usedByCount: 12301,
      },
      {
        id: 'ver_payout_v1',
        contractId: 'contract_payout',
        versionNumber: 1,
        versionLabel: 'v1',
        status: 'deprecated',
        fields: DEFAULT_FIELDS.slice(0, 5),
        invariants: DEFAULT_INVARIANTS.slice(0, 2),
        createdAt: '2026-01-10T10:00:00Z',
        createdBy: 'platform_admin',
        publishedAt: '2026-01-10T12:00:00Z',
        publishedBy: 'platform_admin',
        changelog: [
          {
            id: 'ch_2',
            timestamp: '2026-01-16T09:00:00Z',
            author: 'platform_admin',
            action: 'deprecated',
            description: 'Deprecated in favor of v2',
          },
        ],
        usedByCount: 5420,
      },
    ],
  },
  {
    id: 'contract_refund',
    name: 'CONTRACT_REFUND',
    description: 'Canonical schema for refund intents',
    createdAt: '2026-01-12T08:00:00Z',
    createdBy: 'platform_admin',
    activeVersionId: 'ver_refund_v1',
    versions: [
      {
        id: 'ver_refund_v1',
        contractId: 'contract_refund',
        versionNumber: 1,
        versionLabel: 'v1',
        status: 'active',
        fields: [
          { id: 'f_1', name: 'refund_id', type: 'string', required: true, description: 'Unique refund identifier', order: 0 },
          { id: 'f_2', name: 'original_intent_id', type: 'string', required: true, description: 'Original payment intent ID', isInvariant: true, order: 1 },
          { id: 'f_3', name: 'amount', type: 'number', required: true, description: 'Refund amount', isInvariant: true, order: 2 },
          { id: 'f_4', name: 'currency', type: 'string', required: true, description: 'ISO 4217 currency code', isInvariant: true, order: 3 },
          { id: 'f_5', name: 'reason', type: 'string', required: true, description: 'Refund reason', order: 4 },
          { id: 'f_6', name: 'status', type: 'enum', required: true, description: 'Refund status', enumValues: ['pending', 'processing', 'completed', 'failed'], order: 5 },
        ],
        invariants: [
          { id: 'i_1', type: 'validation', fieldName: 'amount', expression: 'amount > 0', errorMessage: 'Refund amount must be positive', enabled: true },
        ],
        createdAt: '2026-01-12T08:00:00Z',
        createdBy: 'platform_admin',
        publishedAt: '2026-01-12T10:00:00Z',
        publishedBy: 'platform_admin',
        changelog: [],
        usedByCount: 3210,
      },
    ],
  },
  {
    id: 'contract_transfer',
    name: 'CONTRACT_TRANSFER',
    description: 'Canonical schema for bank transfer intents',
    createdAt: '2026-01-20T11:00:00Z',
    createdBy: 'developer_1',
    versions: [
      {
        id: 'ver_transfer_draft',
        contractId: 'contract_transfer',
        versionNumber: 1,
        versionLabel: 'v1',
        status: 'draft',
        fields: [
          { id: 'f_t1', name: 'transfer_id', type: 'string', required: true, description: 'Unique transfer identifier', order: 0 },
          { id: 'f_t2', name: 'amount', type: 'number', required: true, description: 'Transfer amount', isInvariant: true, order: 1 },
          { id: 'f_t3', name: 'currency', type: 'string', required: true, description: 'ISO 4217 currency code', isInvariant: true, order: 2 },
          { id: 'f_t4', name: 'source_account', type: 'object', required: true, description: 'Source account details', isInvariant: true, order: 3 },
          { id: 'f_t5', name: 'destination_account', type: 'object', required: true, description: 'Destination account details', isInvariant: true, order: 4 },
          { id: 'f_t6', name: 'transfer_type', type: 'enum', required: true, description: 'Transfer rail type', enumValues: ['IMPS', 'NEFT', 'RTGS', 'UPI'], order: 5 },
        ],
        invariants: [],
        createdAt: '2026-01-20T11:00:00Z',
        createdBy: 'developer_1',
        lastModified: '2026-02-04T15:30:00Z',
        modifiedBy: 'developer_1',
        changelog: [
          {
            id: 'ch_t1',
            timestamp: '2026-02-04T15:30:00Z',
            author: 'developer_1',
            action: 'field_added',
            description: 'Added transfer_type field',
            fieldName: 'transfer_type',
          },
        ],
      },
    ],
  },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') // 'active', 'draft', 'deprecated', or null for all
  const showDeprecated = searchParams.get('show_deprecated') !== 'false'

  let filteredContracts = [...contracts]

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase()
    filteredContracts = filteredContracts.filter(
      c => c.name.toLowerCase().includes(searchLower) || c.id.toLowerCase().includes(searchLower)
    )
  }

  // Filter versions by status if specified
  if (status) {
    filteredContracts = filteredContracts.map(c => ({
      ...c,
      versions: c.versions.filter(v => v.status === status),
    })).filter(c => c.versions.length > 0)
  }

  // Hide deprecated if requested
  if (!showDeprecated) {
    filteredContracts = filteredContracts.map(c => ({
      ...c,
      versions: c.versions.filter(v => v.status !== 'deprecated'),
    })).filter(c => c.versions.length > 0)
  }

  const response: ContractListResponse = {
    items: filteredContracts,
    total: filteredContracts.length,
  }

  return NextResponse.json(response)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, useDefault } = body

    const contractId = `contract_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    
    // Check if contract already exists
    if (contracts.find(c => c.id === contractId)) {
      return NextResponse.json({ error: 'Contract already exists' }, { status: 400 })
    }

    const versionId = `ver_${contractId}_v1`
    const now = new Date().toISOString()

    const newVersion: SchemaVersion = {
      id: versionId,
      contractId,
      versionNumber: 1,
      versionLabel: 'v1',
      status: 'draft',
      fields: useDefault ? [...DEFAULT_FIELDS] : [],
      invariants: useDefault ? [...DEFAULT_INVARIANTS] : [],
      createdAt: now,
      createdBy: 'current_user',
      changelog: [
        {
          id: `ch_${Date.now()}`,
          timestamp: now,
          author: 'current_user',
          action: 'created',
          description: useDefault ? 'Created with default schema template' : 'Created empty schema',
        },
      ],
    }

    const newContract: Contract = {
      id: contractId,
      name,
      description,
      createdAt: now,
      createdBy: 'current_user',
      versions: [newVersion],
    }

    contracts.push(newContract)

    return NextResponse.json(newContract, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 })
  }
}
