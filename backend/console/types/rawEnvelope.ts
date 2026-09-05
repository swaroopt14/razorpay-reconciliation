export type RawEnvelopeSource = 'API' | 'BATCH' | 'WEBHOOK'

export interface RawEnvelope {
  envelope_id: string
  source: RawEnvelopeSource
  content_type: string
  size_bytes: number
  sha256: string
  received_at: string
}

export interface RawEnvelopeListResponse {
  items: RawEnvelope[]
}
