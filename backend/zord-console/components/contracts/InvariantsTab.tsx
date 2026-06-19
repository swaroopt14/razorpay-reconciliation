'use client'

import { useState } from 'react'
import { FieldDefinition, InvariantRule, InvariantType, RULE_TEMPLATES } from '@/types/contract'

interface InvariantsTabProps {
  fields: FieldDefinition[]
  invariants: InvariantRule[]
  isReadOnly: boolean
  onFieldsChange: (fields: FieldDefinition[]) => void
  onInvariantsChange: (invariants: InvariantRule[]) => void
}

interface AddValidationRuleModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (rule: InvariantRule) => void
  fields: FieldDefinition[]
}

function getRuleTypeBadge(type: InvariantType) {
  const styles: Record<InvariantType, string> = {
    immutable: 'bg-amber-50 text-amber-800 border-amber-200',
    validation: 'bg-blue-50 text-blue-800 border-blue-200',
    condition: 'bg-purple-50 text-purple-800 border-purple-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[type]}`}>
      {type}
    </span>
  )
}

function AddValidationRuleModal({ isOpen, onClose, onAdd, fields }: AddValidationRuleModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [fieldName, setFieldName] = useState('')
  const [expression, setExpression] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [error, setError] = useState('')

  const handleTemplateSelect = (templateId: string) => {
    const template = RULE_TEMPLATES[Number(templateId)]
    if (template) {
      setSelectedTemplate(templateId)
      setExpression(template.expression)
      setErrorMessage(`${template.label} failed`)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!expression.trim()) {
      setError('Expression is required')
      return
    }

    const newRule: InvariantRule = {
      id: `rule_${Date.now()}`,
      type: 'validation',
      fieldName: fieldName || undefined,
      expression: expression.trim(),
      errorMessage: errorMessage.trim() || 'Validation failed',
      enabled: true,
    }

    onAdd(newRule)
    
    // Reset form
    setSelectedTemplate('')
    setFieldName('')
    setExpression('')
    setErrorMessage('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Add Validation Rule</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Rule Templates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start from Template</label>
            <div className="grid grid-cols-2 gap-2">
              {RULE_TEMPLATES.map((template, index) => {
                const templateId = String(index)
                return (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => handleTemplateSelect(templateId)}
                  className={`p-3 text-left border rounded-md transition-colors ${
                    selectedTemplate === templateId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{template.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                </button>
                )
              })}
            </div>
          </div>

          {/* Field Name (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Field (Optional)</label>
            <select
              value={fieldName}
              onChange={e => setFieldName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">All fields / Global rule</option>
              {fields.map(f => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Expression */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expression <span className="text-red-500">*</span>
            </label>
            <textarea
              value={expression}
              onChange={e => setExpression(e.target.value)}
              rows={3}
              placeholder="e.g., amount >= 0 && amount <= 1000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Use field names as variables. Supports JavaScript-like expressions.
            </p>
          </div>

          {/* Error Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Error Message</label>
            <input
              type="text"
              value={errorMessage}
              onChange={e => setErrorMessage(e.target.value)}
              placeholder="Message shown when validation fails"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function InvariantsTab({
  fields,
  invariants,
  isReadOnly,
  onFieldsChange,
  onInvariantsChange,
}: InvariantsTabProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedSection, setExpandedSection] = useState<'immutable' | 'validation' | 'both'>('both')

  // Get immutable fields from the fields list
  const immutableFields = fields.filter(f => f.isInvariant)

  // Get validation rules
  const validationRules = invariants.filter(r => r.type === 'validation' || r.type === 'condition')

  const handleToggleFieldInvariant = (fieldId: string) => {
    onFieldsChange(
      fields.map(f =>
        f.id === fieldId ? { ...f, isInvariant: !f.isInvariant } : f
      )
    )
  }

  const handleAddRule = (rule: InvariantRule) => {
    onInvariantsChange([...invariants, rule])
  }

  const handleRemoveRule = (ruleId: string) => {
    if (window.confirm('Are you sure you want to remove this rule?')) {
      onInvariantsChange(invariants.filter(r => r.id !== ruleId))
    }
  }

  const handleToggleRuleEnabled = (ruleId: string) => {
    onInvariantsChange(
      invariants.map(r =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      )
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Field Invariants Section */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <button
            onClick={() => setExpandedSection(expandedSection === 'validation' ? 'both' : expandedSection === 'both' ? 'validation' : 'both')}
            className="w-full px-4 py-3 flex items-center justify-between text-left border-b border-gray-200 bg-gray-50 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  expandedSection === 'validation' ? '' : 'rotate-90'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-900">Field Invariants</h2>
              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full">
                {immutableFields.length}
              </span>
            </div>
            <span className="text-xs text-gray-500">Fields that cannot change after creation</span>
          </button>

          {expandedSection !== 'validation' && (
            <div className="p-4">
              {fields.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No fields defined. Add fields in the Fields & Data tab first.
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map(field => (
                    <div
                      key={field.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        field.isInvariant
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`font-mono text-sm ${field.isInvariant ? 'text-amber-800' : 'text-gray-700'}`}>
                          {field.name}
                        </span>
                        <span className="text-xs text-gray-500">{field.type}</span>
                      </div>
                      
                      {isReadOnly ? (
                        field.isInvariant && (
                          <span className="inline-flex items-center space-x-1 text-amber-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span className="text-xs font-medium">Immutable</span>
                          </span>
                        )
                      ) : (
                        <button
                          onClick={() => handleToggleFieldInvariant(field.id)}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                            field.isInvariant
                              ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {field.isInvariant ? 'Immutable' : 'Mutable'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Validation Rules Section */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setExpandedSection(expandedSection === 'immutable' ? 'both' : expandedSection === 'both' ? 'immutable' : 'both')}
                className="flex items-center space-x-2"
              >
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    expandedSection === 'immutable' ? '' : 'rotate-90'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-900">Validation Rules</h2>
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                  {validationRules.length}
                </span>
              </button>
            </div>
            
            {!isReadOnly && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center space-x-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Rule</span>
              </button>
            )}
          </div>

          {expandedSection !== 'immutable' && (
            <div className="p-4">
              {validationRules.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-500">No validation rules defined</p>
                  {!isReadOnly && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      Add your first rule
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {validationRules.map(rule => (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        rule.enabled
                          ? 'bg-white border-gray-200'
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            {getRuleTypeBadge(rule.type)}
                            {rule.fieldName && (
                              <span className="text-xs text-gray-500">
                                Target: <span className="font-mono">{rule.fieldName}</span>
                              </span>
                            )}
                          </div>
                          
                          <div className="bg-gray-100 rounded px-3 py-2 mb-2">
                            <code className="text-sm text-gray-800 font-mono break-all">
                              {rule.expression}
                            </code>
                          </div>
                          
                          {rule.errorMessage && (
                            <p className="text-xs text-gray-500">
                              Error: <span className="text-red-600">{rule.errorMessage}</span>
                            </p>
                          )}
                        </div>

                        {!isReadOnly && (
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => handleToggleRuleEnabled(rule.id)}
                              className={`p-1.5 rounded transition-colors ${
                                rule.enabled
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-gray-400 hover:bg-gray-100'
                              }`}
                              title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {rule.enabled ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                )}
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveRule(rule.id)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Remove rule"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Invariants Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-blue-600 font-semibold">{immutableFields.length}</p>
              <p className="text-blue-700 text-xs">Immutable Fields</p>
            </div>
            <div>
              <p className="text-blue-600 font-semibold">{validationRules.filter(r => r.enabled).length}</p>
              <p className="text-blue-700 text-xs">Active Rules</p>
            </div>
            <div>
              <p className="text-blue-600 font-semibold">{validationRules.filter(r => !r.enabled).length}</p>
              <p className="text-blue-700 text-xs">Disabled Rules</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      <AddValidationRuleModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddRule}
        fields={fields}
      />
    </div>
  )
}
