'use client'

import { useState, useMemo } from 'react'
import { Contract, SchemaVersion, VersionStatus } from '@/types/contract'

interface SchemaSidebarProps {
  contracts: Contract[]
  selectedContractId: string | null
  selectedVersionId: string | null
  onSelectContract: (contract: Contract) => void
  onSelectVersion: (version: SchemaVersion) => void
  onCreateContract: () => void
  onCreateVersion: () => void
}

function getStatusBadge(status: VersionStatus) {
  const styles: Record<VersionStatus, string> = {
    draft: 'bg-gray-100 text-gray-800 border-gray-300',
    active: 'bg-green-50 text-green-800 border-green-300',
    deprecated: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  )
}

export function SchemaSidebar({
  contracts,
  selectedContractId,
  selectedVersionId,
  onSelectContract,
  onSelectVersion,
  onCreateContract,
  onCreateVersion,
}: SchemaSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [showDeprecated, setShowDeprecated] = useState(false)
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set())

  // Filter contracts based on search and filters
  const filteredContracts = useMemo(() => {
    return contracts
      .filter(contract => {
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesName = contract.name.toLowerCase().includes(query)
          const matchesId = contract.id.toLowerCase().includes(query)
          if (!matchesName && !matchesId) return false
        }
        return true
      })
      .map(contract => ({
        ...contract,
        versions: contract.versions.filter(version => {
          if (showActiveOnly && version.status !== 'active') return false
          if (!showDeprecated && version.status === 'deprecated') return false
          return true
        }),
      }))
      .filter(contract => contract.versions.length > 0 || !showActiveOnly)
  }, [contracts, searchQuery, showActiveOnly, showDeprecated])

  const toggleContract = (contractId: string) => {
    setExpandedContracts(prev => {
      const next = new Set(prev)
      if (next.has(contractId)) {
        next.delete(contractId)
      } else {
        next.add(contractId)
      }
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Contracts</h2>
          <button
            onClick={onCreateContract}
            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
            title="Create new contract"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search contracts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 space-y-2">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={e => setShowActiveOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">Active only</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showDeprecated}
            onChange={e => setShowDeprecated(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">Show deprecated</span>
        </label>
      </div>

      {/* Contract List */}
      <div className="flex-1 overflow-y-auto">
        {filteredContracts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No contracts found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="py-2">
            {filteredContracts.map(contract => {
              const isExpanded = expandedContracts.has(contract.id) || contract.id === selectedContractId
              const isSelected = contract.id === selectedContractId

              return (
                <div key={contract.id} className="mb-1">
                  {/* Contract Header */}
                  <button
                    onClick={() => {
                      toggleContract(contract.id)
                      if (!isSelected) {
                        onSelectContract(contract)
                      }
                    }}
                    className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-2 border-blue-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <svg
                        className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className={`text-sm font-mono truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                        {contract.name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {contract.versions.length}v
                    </span>
                  </button>

                  {/* Version List */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-b border-gray-100">
                      {contract.versions.map(version => {
                        const isVersionSelected = version.id === selectedVersionId

                        return (
                          <button
                            key={version.id}
                            onClick={() => onSelectVersion(version)}
                            className={`w-full pl-10 pr-4 py-2 flex items-center justify-between text-left transition-colors ${
                              isVersionSelected
                                ? 'bg-blue-100'
                                : 'hover:bg-gray-100'
                            }`}
                          >
                            <span className={`text-sm font-mono ${isVersionSelected ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>
                              {version.versionLabel}
                            </span>
                            {getStatusBadge(version.status)}
                          </button>
                        )
                      })}

                      {/* New Version Button */}
                      {isSelected && (
                        <button
                          onClick={onCreateVersion}
                          className="w-full pl-10 pr-4 py-2 flex items-center space-x-2 text-left text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>New version</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Shortcuts */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Shortcuts</h3>
        <div className="space-y-1">
          <button className="w-full px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded flex items-center space-x-2 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>History & Diff</span>
          </button>
          <button className="w-full px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded flex items-center space-x-2 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>Compare versions</span>
          </button>
        </div>
      </div>
    </div>
  )
}
