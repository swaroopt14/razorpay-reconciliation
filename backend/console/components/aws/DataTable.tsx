'use client'

import { useState, ReactNode } from 'react'
import Link from 'next/link'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  sortable?: boolean
  filterable?: boolean
  width?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (item: T) => void
  getRowKey: (item: T) => string
  emptyMessage?: string
  filterPlaceholder?: string
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  getRowKey,
  emptyMessage = 'No items found',
  filterPlaceholder = 'Filter items...'
}: DataTableProps<T>) {
  const [filterText, setFilterText] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Filter data
  const filteredData = data.filter(item => {
    if (!filterText) return true
    const searchText = filterText.toLowerCase()
    return columns.some(col => {
      const value = col.render 
        ? String(col.render(item)).toLowerCase()
        : String((item as any)[col.key]).toLowerCase()
      return value.includes(searchText)
    })
  })

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    
    const col = columns.find(c => c.key === sortColumn)
    if (!col || !col.sortable) return 0

    const aValue = col.render ? String(col.render(a)) : (a as any)[col.key]
    const bValue = col.render ? String(col.render(b)) : (b as any)[col.key]
    
    const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (columnKey: string) => {
    const col = columns.find(c => c.key === columnKey)
    if (!col || !col.sortable) return

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  return (
    <div className="bg-white border border-gray-300">
      {/* Filter Bar */}
      <div className="px-4 py-3 border-b border-gray-300 bg-gray-50">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={filterPlaceholder}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        {filterText && (
          <span className="ml-2 text-sm text-gray-600">
            {filteredData.length} of {data.length} items
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.header}</span>
                    {column.sortable && sortColumn === column.key && (
                      <span className="text-gray-400">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-sm text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr
                  key={getRowKey(item)}
                  className={`${onRowClick ? 'cursor-pointer' : ''} hover:bg-gray-50`}
                  onClick={() => onRowClick && onRowClick(item)}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    >
                      {column.render ? column.render(item) : String((item as any)[column.key] || '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
