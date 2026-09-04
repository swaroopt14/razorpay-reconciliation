'use client'

import { EvidenceNode } from '@/types/evidence'
import { useState } from 'react'
import { format } from 'date-fns'
import clsx from 'clsx'

interface EvidenceTreeProps {
  tree: EvidenceNode
  onFileSelect: (path: string) => void
  selectedPath?: string
}

export function EvidenceTree({ tree, onFileSelect, selectedPath }: EvidenceTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']))

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpanded(newExpanded)
  }

  const renderNode = (node: EvidenceNode, level: number = 0): React.ReactNode => {
    const isExpanded = expanded.has(node.path)
    const isSelected = selectedPath === node.path
    const isFile = node.type === 'file'

    return (
      <div key={node.path}>
        <div
          className={clsx(
            'flex items-center py-1 px-2 rounded hover:bg-gray-50 cursor-pointer',
            isSelected && 'bg-blue-50',
            level > 0 && 'ml-4'
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (isFile) {
              onFileSelect(node.path)
            } else {
              toggleExpand(node.path)
            }
          }}
        >
          {!isFile && (
            <svg
              className={clsx('h-4 w-4 mr-2 text-gray-500', isExpanded && 'rotate-90')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {isFile && <span className="h-4 w-4 mr-2 text-gray-400">▸</span>}
          <span className={clsx('text-sm', isFile ? 'text-gray-700' : 'text-gray-900 font-medium')}>
            {node.name}
          </span>
          {node.createdAt && (
            <span className="ml-auto text-xs text-gray-500">
              {format(new Date(node.createdAt), 'HH:mm:ss')}
            </span>
          )}
        </div>
        {!isFile && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white h-full overflow-y-auto">
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Evidence Tree</h3>
        <div className="space-y-1">
          {renderNode(tree)}
        </div>
      </div>
    </div>
  )
}
