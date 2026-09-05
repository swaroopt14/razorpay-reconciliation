export type ProtocolVerifyResult = 'VALID' | 'VALID WITH CAVEATS' | 'INVALID' | 'UNVERIFIABLE'

export type ProtocolSignature = {
  format: string
  alg: string
  kid: string
  value: string
  detached?: string
}

export type ProtocolObject = {
  spec_version?: string
  media_type?: string
  digest?: string
  signature?: ProtocolSignature
  canonicalization?: string
  digest_alg?: string
  [key: string]: unknown
}
