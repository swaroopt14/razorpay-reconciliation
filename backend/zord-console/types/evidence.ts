export interface EvidenceNode {
  name: string
  type: 'folder' | 'file'
  path: string
  children?: EvidenceNode[]
  createdAt?: string
  hash?: string
  source?: string
  size?: number
}

export interface EvidenceFile {
  path: string
  content: string | object
  contentType: string
  createdAt: string
  hash: string
  source: string
}

export interface EvidenceTree {
  receiptId: string
  root: EvidenceNode
}
