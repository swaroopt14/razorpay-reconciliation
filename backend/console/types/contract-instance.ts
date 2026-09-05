// Types for Runtime Contract Instances (from port 8082 API)

export interface ContractInstance {
  contract_id: string
  tenant_id: string
  intent_id: string
  envelope_id: string
  contract_payload: string // Base64 encoded
  contract_hash: string
  status: 'ISSUED' | 'FAILED' | 'COMPLETED' | 'PENDING' | 'PROCESSING'
  created_at: string
  trace_id?: string
}

export interface ContractInstanceListResponse {
  contracts: ContractInstance[]
  total?: number
  page?: number
  limit?: number
}

// Decoded contract payload interface (after base64 decode)
export interface DecodedContractPayload {
  amount: {
    value: string
    currency: string
  }
  source: string
  remitter: {
    customer_id: string
  }
  beneficiary: {
    country: string
    instrument: {
      kind: string
    }
  }
  constraints: {
    deadline_at: string
  }
  intent_type: string
  purpose_code: string
  source_system: string
  account_number: string
  schema_version: string
}