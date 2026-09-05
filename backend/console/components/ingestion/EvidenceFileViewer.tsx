'use client'

import { EvidenceFile } from '@/types/evidence'
import { format } from 'date-fns'

interface EvidenceFileViewerProps {
  file: EvidenceFile | null
}

export function EvidenceFileViewer({ file }: EvidenceFileViewerProps) {
  if (!file) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm">Select a file to view</p>
      </div>
    )
  }

  const isJSON = file.contentType === 'application/json'
  const content = typeof file.content === 'string' 
    ? file.content 
    : JSON.stringify(file.content, null, 2)

  return (
    <div className="border border-gray-200 rounded-lg bg-white h-full flex flex-col">
      <div className="border-b border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{file.path.split('/').pop()}</h3>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            {file.createdAt && (
              <span>Created: {format(new Date(file.createdAt), 'yyyy-MM-dd HH:mm:ss')} UTC</span>
            )}
            {file.hash && <span>Hash: {file.hash}</span>}
            {file.source && <span>Source: {file.source}</span>}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words">
          {content}
        </pre>
      </div>
    </div>
  )
}
