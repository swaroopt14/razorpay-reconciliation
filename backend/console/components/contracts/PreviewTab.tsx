'use client'

import { useState, useMemo } from 'react'
import { FieldDefinition, InvariantRule } from '@/types/contract'

interface PreviewTabProps {
  contractName: string
  fields: FieldDefinition[]
  invariants: InvariantRule[]
}

type ViewMode = 'json-schema' | 'sample-intent' | 'tree-view'

function generateSampleValue(field: FieldDefinition): unknown {
  switch (field.type) {
    case 'string':
      if (field.name.includes('id')) return `${field.name}_abc123`
      if (field.name.includes('name')) return 'Sample Name'
      if (field.name.includes('description')) return 'Sample description text'
      return 'sample_string'
    case 'number':
      if (field.name.includes('amount')) return 10000
      if (field.name.includes('count')) return 5
      return 42
    case 'boolean':
      return true
    case 'datetime':
      return new Date().toISOString()
    case 'date':
      return new Date().toISOString().split('T')[0]
    case 'email':
      return 'sample@example.com'
    case 'url':
      return 'https://example.com/resource'
    case 'enum':
      return field.enumValues?.[0] || 'option1'
    case 'object':
      return {}
    case 'array':
      return []
    default:
      return null
  }
}

function generateJsonSchema(contractName: string, fields: FieldDefinition[]) {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  fields.forEach(field => {
    let type: string = field.type
    const property: Record<string, unknown> = {}

    // Map types to JSON Schema types
    switch (field.type) {
      case 'datetime':
        type = 'string'
        property.format = 'date-time'
        break
      case 'date':
        type = 'string'
        property.format = 'date'
        break
      case 'email':
        type = 'string'
        property.format = 'email'
        break
      case 'url':
        type = 'string'
        property.format = 'uri'
        break
      case 'enum':
        type = 'string'
        if (field.enumValues && field.enumValues.length > 0) {
          property.enum = field.enumValues
        }
        break
    }

    property.type = type
    if (field.description) property.description = field.description
    if (field.default !== undefined) property.default = field.default

    properties[field.name] = property

    if (field.required) {
      required.push(field.name)
    }
  })

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: contractName,
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  }
}

function generateSampleIntent(fields: FieldDefinition[]) {
  const sample: Record<string, unknown> = {}
  fields.forEach(field => {
    sample[field.name] = generateSampleValue(field)
  })
  return sample
}

interface ValidationResult {
  isValid: boolean
  fieldCount: number
  requiredCount: number
  immutableCount: number
  ruleCount: number
  errors: string[]
  warnings: string[]
}

function calculateValidation(fields: FieldDefinition[], invariants: InvariantRule[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for minimum fields
  if (fields.length === 0) {
    errors.push('Schema has no fields defined')
  }

  // Check for at least one required field
  const requiredFields = fields.filter(f => f.required)
  if (requiredFields.length === 0 && fields.length > 0) {
    warnings.push('No required fields - consider marking key fields as required')
  }

  // Check for naming conventions
  fields.forEach(field => {
    if (!/^[a-z][a-z0-9_]*$/.test(field.name)) {
      warnings.push(`Field "${field.name}" doesn't follow snake_case convention`)
    }
  })

  // Check immutable fields have descriptions
  const immutableFields = fields.filter(f => f.isInvariant)
  immutableFields.forEach(field => {
    if (!field.description) {
      warnings.push(`Immutable field "${field.name}" should have a description`)
    }
  })

  // Check enum fields have values
  fields.filter(f => f.type === 'enum').forEach(field => {
    if (!field.enumValues || field.enumValues.length === 0) {
      errors.push(`Enum field "${field.name}" has no values defined`)
    }
  })

  // Validate rules reference existing fields
  const fieldNames = new Set(fields.map(f => f.name))
  invariants.forEach(rule => {
    if (rule.fieldName && !fieldNames.has(rule.fieldName)) {
      errors.push(`Rule references non-existent field "${rule.fieldName}"`)
    }
  })

  return {
    isValid: errors.length === 0,
    fieldCount: fields.length,
    requiredCount: requiredFields.length,
    immutableCount: immutableFields.length,
    ruleCount: invariants.filter(r => r.enabled).length,
    errors,
    warnings,
  }
}

export function PreviewTab({ contractName, fields, invariants }: PreviewTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('json-schema')
  const [copied, setCopied] = useState(false)

  // Generate content based on view mode
  const jsonSchema = useMemo(() => generateJsonSchema(contractName, fields), [contractName, fields])
  const sampleIntent = useMemo(() => generateSampleIntent(fields), [fields])
  const validation = useMemo(() => calculateValidation(fields, invariants), [fields, invariants])

  const currentContent = useMemo(() => {
    switch (viewMode) {
      case 'json-schema':
        return JSON.stringify(jsonSchema, null, 2)
      case 'sample-intent':
        return JSON.stringify(sampleIntent, null, 2)
      default:
        return ''
    }
  }, [viewMode, jsonSchema, sampleIntent])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const blob = new Blob([currentContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${contractName}_${viewMode}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View Mode Tabs */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'json-schema', label: 'JSON Schema' },
              { id: 'sample-intent', label: 'Sample Intent' },
              { id: 'tree-view', label: 'Tree View' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {viewMode !== 'tree-view' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-1"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {viewMode === 'tree-view' ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Schema Structure</h3>
              {fields.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No fields defined</p>
              ) : (
                <div className="space-y-2">
                  {fields.map(field => (
                    <div
                      key={field.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        field.isInvariant
                          ? 'bg-amber-50 border-amber-200'
                          : field.required
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-sm text-gray-900">{field.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                          {field.type}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {field.required && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
                            Required
                          </span>
                        )}
                        {field.isInvariant && (
                          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-200 flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Immutable</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {viewMode === 'json-schema' ? 'Generated JSON Schema' : 'Sample Payload'}
                </span>
                <span className="text-xs text-gray-400">Read-only</span>
              </div>
              <pre className="p-4 text-sm font-mono text-gray-800 overflow-auto max-h-[calc(100vh-400px)]">
                {currentContent}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Validation Sidebar */}
      <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white overflow-auto">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">Validation Results</h3>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          <div className={`p-4 rounded-lg border ${
            validation.isValid
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center space-x-2">
              {validation.isValid ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">Schema Valid</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-red-800">Validation Errors</span>
                </>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Statistics</h4>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Total Fields</dt>
                <dd className="text-sm font-semibold text-gray-900">{validation.fieldCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Required Fields</dt>
                <dd className="text-sm font-semibold text-red-600">{validation.requiredCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Immutable Fields</dt>
                <dd className="text-sm font-semibold text-amber-600">{validation.immutableCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Validation Rules</dt>
                <dd className="text-sm font-semibold text-blue-600">{validation.ruleCount}</dd>
              </div>
            </dl>
          </div>

          {/* Errors */}
          {validation.errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <h4 className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2 flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Errors ({validation.errors.length})</span>
              </h4>
              <ul className="space-y-1">
                {validation.errors.map((error, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start space-x-1">
                    <span className="text-red-400">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <h4 className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-2 flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Warnings ({validation.warnings.length})</span>
              </h4>
              <ul className="space-y-1">
                {validation.warnings.map((warning, i) => (
                  <li key={i} className="text-sm text-yellow-700 flex items-start space-x-1">
                    <span className="text-yellow-400">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* All Good */}
          {validation.isValid && validation.warnings.length === 0 && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
              <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800 font-medium">Schema looks good!</p>
              <p className="text-xs text-green-600 mt-1">No errors or warnings found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
