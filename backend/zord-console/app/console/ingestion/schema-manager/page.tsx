'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { SchemaSidebar } from '@/components/contracts/SchemaSidebar'
import { FieldsTab } from '@/components/contracts/FieldsTab'
import { InvariantsTab } from '@/components/contracts/InvariantsTab'
import { PreviewTab } from '@/components/contracts/PreviewTab'
import { OnboardingWelcome } from '@/components/contracts/OnboardingWelcome'
import { 
  Contract, 
  SchemaVersion, 
  FieldDefinition, 
  InvariantRule,
} from '@/types/contract'

type TabId = 'fields' | 'invariants' | 'preview'

function getStatusBadge(status: 'draft' | 'active' | 'deprecated') {
  const styles = {
    draft: 'bg-gray-100 text-gray-800 border-gray-300',
    active: 'bg-green-50 text-green-800 border-green-300',
    deprecated: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  )
}

export default function SchemaManagerPage() {
  const router = useRouter()
  const user = getCurrentUser()

  // State
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<SchemaVersion | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('fields')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Local editable state for the current version
  const [editableFields, setEditableFields] = useState<FieldDefinition[]>([])
  const [editableInvariants, setEditableInvariants] = useState<InvariantRule[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Helper to select a contract and its latest version
  const selectContractAndVersion = useCallback((contract: Contract) => {
    setSelectedContract(contract)
    const latestVersion = contract.versions
      .filter(v => v.status !== 'deprecated')
      .sort((a, b) => b.versionNumber - a.versionNumber)[0] || contract.versions[0]
    
    if (latestVersion) {
      setSelectedVersion(latestVersion)
      setEditableFields([...latestVersion.fields])
      setEditableInvariants([...latestVersion.invariants])
      setHasUnsavedChanges(false)
    }
    setShowOnboarding(false)
  }, [])

  const fetchContracts = useCallback(async (autoSelect = false) => {
    try {
      setLoading(true)
      const response = await fetch('/api/prod/contracts')
      const data = await response.json()
      // API returns { items: [...], total: ... }
      const contractsList = data.items || data.contracts || []
      setContracts(contractsList)
      if (contractsList.length === 0) {
        setShowOnboarding(true)
      } else if (autoSelect && contractsList.length > 0) {
        // Auto-select first contract on initial load
        selectContractAndVersion(contractsList[0])
      }
    } catch (error) {
      console.error('Failed to fetch contracts:', error)
    } finally {
      setLoading(false)
    }
  }, [selectContractAndVersion])

  // Auth check and initial load
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    fetchContracts(true) // Auto-select first contract on initial load
  }, [router, fetchContracts])

  // Handle contract selection
  const handleSelectContract = useCallback((contract: Contract) => {
    selectContractAndVersion(contract)
  }, [selectContractAndVersion])

  // Handle version selection
  const handleSelectVersion = useCallback((version: SchemaVersion) => {
    setSelectedVersion(version)
    setEditableFields([...version.fields])
    setEditableInvariants([...version.invariants])
    setHasUnsavedChanges(false)
  }, [])

  // Handle field changes
  const handleFieldsChange = useCallback((fields: FieldDefinition[]) => {
    setEditableFields(fields)
    setHasUnsavedChanges(true)
  }, [])

  // Handle invariant changes
  const handleInvariantsChange = useCallback((invariants: InvariantRule[]) => {
    setEditableInvariants(invariants)
    setHasUnsavedChanges(true)
  }, [])

  // Handle creating a new contract
  const handleCreateContract = async (useDefaults: boolean) => {
    try {
      const response = await fetch('/api/prod/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `CONTRACT_NEW_${Date.now()}`,
          description: 'New contract schema',
          useDefaults,
        }),
      })
      
      if (response.ok) {
        const newContract = await response.json()
        await fetchContracts()
        
        const updatedResponse = await fetch('/api/prod/contracts')
        const updatedData = await updatedResponse.json()
        const contractsList = updatedData.items || updatedData.contracts || []
        const created = contractsList.find((c: Contract) => c.id === newContract.id)
        if (created) {
          handleSelectContract(created)
        }
      }
    } catch (error) {
      console.error('Failed to create contract:', error)
    }
  }

  // Handle onboarding option selection
  const handleOnboardingSelect = async (option: 'default' | 'fresh' | 'ai') => {
    if (option === 'ai') return
    await handleCreateContract(option === 'default')
    setShowOnboarding(false)
  }

  // Save draft
  const handleSaveDraft = async () => {
    if (!selectedVersion || !selectedContract) return

    try {
      setSaving(true)
      const response = await fetch(
        `/api/prod/contracts/${selectedContract.id}/versions/${selectedVersion.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: editableFields,
            invariants: editableInvariants,
          }),
        }
      )

      if (response.ok) {
        setHasUnsavedChanges(false)
        await fetchContracts()
      }
    } catch (error) {
      console.error('Failed to save draft:', error)
    } finally {
      setSaving(false)
    }
  }

  // Publish version
  const handlePublish = async () => {
    if (!selectedVersion || !selectedContract) return

    const confirmed = window.confirm(
      `Are you sure you want to publish ${selectedVersion.versionLabel}? This will make it the active version and deprecate any currently active versions.`
    )

    if (!confirmed) return

    try {
      setSaving(true)
      const response = await fetch(
        `/api/prod/contracts/${selectedContract.id}/versions/${selectedVersion.id}/publish`,
        { method: 'POST' }
      )

      if (response.ok) {
        await fetchContracts()
        const updatedResponse = await fetch(`/api/prod/contracts/${selectedContract.id}`)
        const updatedContract = await updatedResponse.json()
        if (updatedContract) {
          setSelectedContract(updatedContract)
          const updatedVersion = updatedContract.versions?.find(
            (v: SchemaVersion) => v.id === selectedVersion.id
          )
          if (updatedVersion) {
            handleSelectVersion(updatedVersion)
          }
        }
      }
    } catch (error) {
      console.error('Failed to publish version:', error)
    } finally {
      setSaving(false)
    }
  }

  // Deprecate version
  const handleDeprecate = async () => {
    if (!selectedVersion || !selectedContract) return

    const confirmed = window.confirm(
      `Are you sure you want to deprecate ${selectedVersion.versionLabel}? ${
        selectedVersion.usedByCount
          ? `This version is still used by ${selectedVersion.usedByCount} intents.`
          : ''
      }`
    )

    if (!confirmed) return

    try {
      setSaving(true)
      const response = await fetch(
        `/api/prod/contracts/${selectedContract.id}/versions/${selectedVersion.id}/deprecate`,
        { method: 'POST' }
      )

      if (response.ok) {
        await fetchContracts()
      }
    } catch (error) {
      console.error('Failed to deprecate version:', error)
    } finally {
      setSaving(false)
    }
  }

  // Create new version
  const handleNewVersion = async () => {
    if (!selectedContract) return

    try {
      setSaving(true)
      const response = await fetch(
        `/api/prod/contracts/${selectedContract.id}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cloneFromVersionId: selectedVersion?.id,
          }),
        }
      )

      if (response.ok) {
        const newVersion = await response.json()
        await fetchContracts()
        
        const updatedResponse = await fetch(`/api/prod/contracts/${selectedContract.id}`)
        const updatedContract = await updatedResponse.json()
        if (updatedContract) {
          setSelectedContract(updatedContract)
          const created = updatedContract.versions?.find(
            (v: SchemaVersion) => v.id === newVersion.id
          )
          if (created) {
            handleSelectVersion(created)
          }
        }
      }
    } catch (error) {
      console.error('Failed to create new version:', error)
    } finally {
      setSaving(false)
    }
  }

  // Export JSON
  const handleExportJson = () => {
    if (!selectedVersion || !selectedContract) return

    const schemaData = {
      contract: {
        id: selectedContract.id,
        name: selectedContract.name,
        description: selectedContract.description,
      },
      version: {
        id: selectedVersion.id,
        versionLabel: selectedVersion.versionLabel,
        status: selectedVersion.status,
      },
      fields: editableFields,
      invariants: editableInvariants,
    }

    const blob = new Blob([JSON.stringify(schemaData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedContract.name}_${selectedVersion.versionLabel}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Tab definitions
  const tabs: { id: TabId; label: string }[] = [
    { id: 'fields', label: 'Fields & Data' },
    { id: 'invariants', label: 'Invariants & Rules' },
    { id: 'preview', label: 'Preview & Validation' },
  ]

  // Render loading state
  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Manager']}
        tenant={user?.tenant}
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-4 text-sm text-gray-600">Loading schemas...</p>
          </div>
        </div>
      </Layout>
    )
  }

  // Render onboarding
  if (showOnboarding && contracts.length === 0) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Schema Manager']}
        tenant={user?.tenant}
      >
        <OnboardingWelcome onSelectOption={handleOnboardingSelect} />
      </Layout>
    )
  }

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Validation & Safety', 'Schema Manager']}
      tenant={user?.tenant}
    >
      <div className="flex h-full">
        {/* Schema Sidebar */}
        <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white">
          <SchemaSidebar
            contracts={contracts}
            selectedContractId={selectedContract?.id || null}
            selectedVersionId={selectedVersion?.id || null}
            onSelectContract={handleSelectContract}
            onSelectVersion={handleSelectVersion}
            onCreateContract={() => handleCreateContract(true)}
            onCreateVersion={handleNewVersion}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {/* Header */}
          <div className="border-b border-gray-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-normal text-gray-900">Schema Manager</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Define and manage canonical intent schemas
                </p>
              </div>
              <div className="flex items-center space-x-3">
                {hasUnsavedChanges && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1.5 animate-pulse" />
                    Unsaved changes
                  </span>
                )}
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                  PRODUCTION
                </span>
                {selectedContract && (
                  <button
                    onClick={handleExportJson}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export JSON
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Version Metadata Bar */}
          {selectedContract && selectedVersion && (
            <div className="border-b border-gray-200 bg-white px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contract</span>
                    <p className="text-sm font-mono text-gray-900">{selectedContract.name}</p>
                  </div>
                  <div className="h-8 w-px bg-gray-200" />
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Version</span>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-mono text-gray-900">{selectedVersion.versionLabel}</p>
                      {getStatusBadge(selectedVersion.status)}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-gray-200" />
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fields</span>
                    <p className="text-sm text-gray-900">{editableFields.length}</p>
                  </div>
                  <div className="h-8 w-px bg-gray-200" />
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Modified</span>
                    <p className="text-sm text-gray-900">
                      {selectedVersion.lastModified
                        ? new Date(selectedVersion.lastModified).toLocaleDateString()
                        : 'Never'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  {selectedVersion.status === 'draft' && (
                    <>
                      <button
                        onClick={handleSaveDraft}
                        disabled={!hasUnsavedChanges || saving}
                        className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        onClick={handlePublish}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Publish
                      </button>
                    </>
                  )}
                  {selectedVersion.status === 'active' && (
                    <>
                      <button
                        onClick={handleNewVersion}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        New Version
                      </button>
                      <button
                        onClick={handleDeprecate}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Deprecate
                      </button>
                    </>
                  )}
                  {selectedVersion.status === 'deprecated' && (
                    <span className="text-sm text-gray-500">This version is deprecated</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          {selectedContract && selectedVersion && (
            <div className="border-b border-gray-200 bg-white px-6">
              <div className="flex space-x-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {!selectedContract || !selectedVersion ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No schema selected</h3>
                  <p className="text-gray-500 text-sm max-w-sm mb-4">
                    Select a contract from the sidebar or create a new one to get started.
                  </p>
                  <button
                    onClick={() => setShowOnboarding(true)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Create New Schema
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'fields' && (
                  <FieldsTab
                    fields={editableFields}
                    isReadOnly={selectedVersion.status !== 'draft'}
                    onFieldsChange={handleFieldsChange}
                  />
                )}
                {activeTab === 'invariants' && (
                  <InvariantsTab
                    fields={editableFields}
                    invariants={editableInvariants}
                    isReadOnly={selectedVersion.status !== 'draft'}
                    onFieldsChange={handleFieldsChange}
                    onInvariantsChange={handleInvariantsChange}
                  />
                )}
                {activeTab === 'preview' && (
                  <PreviewTab
                    contractName={selectedContract.name}
                    fields={editableFields}
                    invariants={editableInvariants}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
