'use client'

import { useState, useMemo } from 'react'
import { FieldDefinition, FieldType, FIELD_TYPE_OPTIONS } from '@/types/contract'

interface FieldsTabProps {
  fields: FieldDefinition[]
  isReadOnly: boolean
  onFieldsChange: (fields: FieldDefinition[]) => void
}

interface AddFieldModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (field: FieldDefinition) => void
  existingFields: FieldDefinition[]
}

function getTypeIcon(type: FieldType) {
  switch (type) {
    case 'string':
      return <span className="text-blue-600 font-mono text-xs font-bold">Aa</span>
    case 'number':
      return <span className="text-green-600 font-mono text-xs font-bold">#</span>
    case 'boolean':
      return <span className="text-purple-600 font-mono text-xs font-bold">⊤</span>
    case 'datetime':
    case 'date':
      return <span className="text-orange-600 font-mono text-xs font-bold">📅</span>
    case 'email':
      return <span className="text-pink-600 font-mono text-xs font-bold">@</span>
    case 'url':
      return <span className="text-indigo-600 font-mono text-xs font-bold">🔗</span>
    case 'enum':
      return <span className="text-amber-600 font-mono text-xs font-bold">[]</span>
    case 'object':
      return <span className="text-cyan-600 font-mono text-xs font-bold">{'{}'}</span>
    case 'array':
      return <span className="text-red-600 font-mono text-xs font-bold">[]</span>
    default:
      return <span className="text-gray-400 font-mono text-xs font-bold">?</span>
  }
}

function AddFieldModal({ isOpen, onClose, onAdd, existingFields }: AddFieldModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('string')
  const [required, setRequired] = useState(false)
  const [description, setDescription] = useState('')
  const [defaultValue, setDefaultValue] = useState('')
  const [isInvariant, setIsInvariant] = useState(false)
  const [enumValues, setEnumValues] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!name.trim()) {
      setError('Field name is required')
      return
    }

    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      setError('Field name must be snake_case (lowercase letters, numbers, underscores)')
      return
    }

    if (existingFields.some(f => f.name === name)) {
      setError('A field with this name already exists')
      return
    }

    const newField: FieldDefinition = {
      id: `field_${Date.now()}`,
      name: name.trim(),
      type,
      required,
      description: description.trim(),
      default: defaultValue.trim() || undefined,
      isInvariant,
      order: existingFields.length,
      enumValues: type === 'enum' ? enumValues.split(',').map(v => v.trim()).filter(Boolean) : undefined,
    }

    onAdd(newField)
    
    // Reset form
    setName('')
    setType('string')
    setRequired(false)
    setDescription('')
    setDefaultValue('')
    setIsInvariant(false)
    setEnumValues('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Add New Field</h3>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Field Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., payment_amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Use snake_case (lowercase, underscores)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as FieldType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              {FIELD_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {type === 'enum' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enum Values</label>
              <input
                type="text"
                value={enumValues}
                onChange={e => setEnumValues(e.target.value)}
                placeholder="value1, value2, value3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Comma-separated list of allowed values</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe what this field represents..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Value</label>
            <input
              type="text"
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
              placeholder="Optional default value"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={required}
                onChange={e => setRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Required field</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isInvariant}
                onChange={e => setIsInvariant(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Immutable (cannot change after creation)</span>
            </label>
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
              Add Field
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function FieldsTab({ fields, isReadOnly, onFieldsChange }: FieldsTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'order' | 'name'>('order')
  const [showAddModal, setShowAddModal] = useState(false)

  const filteredFields = useMemo(() => {
    let result = [...fields]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        f =>
          f.name.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query)
      )
    }

    // Sort
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      result.sort((a, b) => a.order - b.order)
    }

    return result
  }, [fields, searchQuery, sortBy])

  const handleAddField = (field: FieldDefinition) => {
    onFieldsChange([...fields, field])
  }

  const handleRemoveField = (fieldId: string) => {
    if (window.confirm('Are you sure you want to remove this field?')) {
      onFieldsChange(fields.filter(f => f.id !== fieldId))
    }
  }

  const handleToggleRequired = (fieldId: string) => {
    onFieldsChange(
      fields.map(f =>
        f.id === fieldId ? { ...f, required: !f.required } : f
      )
    )
  }

  const handleToggleInvariant = (fieldId: string) => {
    onFieldsChange(
      fields.map(f =>
        f.id === fieldId ? { ...f, isInvariant: !f.isInvariant } : f
      )
    )
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newFields = [...fields]
    const temp = newFields[index].order
    newFields[index].order = newFields[index - 1].order
    newFields[index - 1].order = temp
    ;[newFields[index], newFields[index - 1]] = [newFields[index - 1], newFields[index]]
    onFieldsChange(newFields)
  }

  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1) return
    const newFields = [...fields]
    const temp = newFields[index].order
    newFields[index].order = newFields[index + 1].order
    newFields[index + 1].order = temp
    ;[newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]]
    onFieldsChange(newFields)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
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
                placeholder="Search fields..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-64"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'order' | 'name')}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="order">Sort by Order</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>

          {!isReadOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Field</span>
            </button>
          )}
        </div>
      </div>

      {/* Fields Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {!isReadOnly && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Order
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Field Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  Required
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  Immutable
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                {!isReadOnly && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFields.length === 0 ? (
                <tr>
                  <td colSpan={isReadOnly ? 5 : 7} className="px-4 py-12 text-center">
                    <div className="text-gray-500">
                      <p className="font-medium">No fields defined</p>
                      <p className="text-sm mt-1">
                        {searchQuery
                          ? 'Try adjusting your search'
                          : 'Add fields to define your schema structure'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFields.map((field, index) => (
                  <tr key={field.id} className="hover:bg-gray-50">
                    {!isReadOnly && (
                      <td className="px-4 py-3">
                        <div className="flex flex-col space-y-1">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === filteredFields.length - 1}
                            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-gray-900">{field.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(field.type)}
                        <span className="text-sm text-gray-600">{field.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isReadOnly ? (
                        field.required ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            Required
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">Optional</span>
                        )
                      ) : (
                        <button
                          onClick={() => handleToggleRequired(field.id)}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                            field.required
                              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                              : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          {field.required ? 'Required' : 'Optional'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isReadOnly ? (
                        field.isInvariant ? (
                          <span className="inline-flex items-center space-x-1 text-amber-600" title="Immutable field">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        <button
                          onClick={() => handleToggleInvariant(field.id)}
                          className={`p-1 rounded transition-colors ${
                            field.isInvariant
                              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                          }`}
                          title={field.isInvariant ? 'Click to make mutable' : 'Click to make immutable'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{field.description || '-'}</span>
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveField(field.id)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove field"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 text-sm text-gray-500">
          {fields.length} field{fields.length !== 1 ? 's' : ''} •{' '}
          {fields.filter(f => f.required).length} required •{' '}
          {fields.filter(f => f.isInvariant).length} immutable
        </div>
      </div>

      {/* Add Field Modal */}
      <AddFieldModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddField}
        existingFields={fields}
      />
    </div>
  )
}
