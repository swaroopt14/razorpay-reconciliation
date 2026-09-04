// API Configuration

export const apiConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
} as const

export const endpoints = {
  receipts: {
    get: (id: string) => `/receipts/${id}`,
    getAll: '/receipts',
    create: '/receipts',
  },
  batches: {
    get: (id: string) => `/batches/${id}`,
    getAll: '/batches',
  },
  evidence: {
    getTree: (receiptId: string) => `/evidence/${receiptId}/tree`,
    getFile: (receiptId: string, filePath: string) => `/evidence/${receiptId}/file?path=${encodeURIComponent(filePath)}`,
  },
} as const
