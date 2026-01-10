'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { Button } from './button'
import { Input } from './input'
import { Checkbox } from './checkbox'
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from 'lucide-react'
import { motion } from 'framer-motion'

export type SortDirection = 'asc' | 'desc' | null

export interface Column<T> {
  id: string
  header: string
  accessorKey?: keyof T
  accessorFn?: (row: T) => string | number | React.ReactNode
  sortable?: boolean
  filterable?: boolean
  cell?: (row: T) => React.ReactNode
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  selectable?: boolean
  onSelectionChange?: (selectedIds: Set<string | number>) => void
  getRowId?: (row: T) => string | number
  searchable?: boolean
  searchPlaceholder?: string
  onExport?: (data: T[]) => void
  loading?: boolean
  className?: string
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  selectable = false,
  onSelectionChange,
  getRowId = (row: T) => (row.id as string | number) || JSON.stringify(row),
  searchable = true,
  searchPlaceholder = 'Search...',
  onExport,
  loading = false,
  className,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortColumn, setSortColumn] = React.useState<string | null>(null)
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string | number>>(new Set())

  // Filter data
  const filteredData = React.useMemo(() => {
    let filtered = data

    if (searchQuery) {
      filtered = filtered.filter((row) =>
        columns.some((col) => {
          const value = col.accessorFn
            ? col.accessorFn(row)
            : col.accessorKey
            ? row[col.accessorKey]
            : ''
          return String(value).toLowerCase().includes(searchQuery.toLowerCase())
        })
      )
    }

    return filtered
  }, [data, searchQuery, columns])

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredData

    const column = columns.find((col) => col.id === sortColumn)
    if (!column || !column.sortable) return filteredData

    return [...filteredData].sort((a, b) => {
      const aValue = column.accessorFn
        ? column.accessorFn(a)
        : column.accessorKey
        ? a[column.accessorKey]
        : ''
      const bValue = column.accessorFn
        ? column.accessorFn(b)
        : column.accessorKey
        ? b[column.accessorKey]
        : ''

      const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true })
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredData, sortColumn, sortDirection, columns])

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      } else {
        setSortDirection('asc')
      }
    } else {
      setSortColumn(columnId)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(sortedData.map((row) => getRowId(row)))
      setSelectedIds(allIds)
      onSelectionChange?.(allIds)
    } else {
      setSelectedIds(new Set())
      onSelectionChange?.(new Set())
    }
  }

  const handleSelectRow = (rowId: string | number, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(rowId)
    } else {
      newSelected.delete(rowId)
    }
    setSelectedIds(newSelected)
    onSelectionChange?.(newSelected)
  }

  const handleExport = () => {
    if (onExport) {
      onExport(sortedData)
    } else {
      // Default CSV export
      const headers = columns.map((col) => col.header).join(',')
      const rows = sortedData.map((row) =>
        columns.map((col) => {
          const value = col.accessorFn
            ? col.accessorFn(row)
            : col.accessorKey
            ? row[col.accessorKey]
            : ''
          return `"${String(value).replace(/"/g, '""')}"`
        }).join(',')
      )
      const csv = [headers, ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'export.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const allSelected = sortedData.length > 0 && sortedData.every((row) => selectedIds.has(getRowId(row)))
  const someSelected = sortedData.some((row) => selectedIds.has(getRowId(row)))

  return (
    <div className={cn('space-y-4', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {searchable && (
          <div className="flex-1 max-w-sm">
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
        )}
        {onExport && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/60 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(column.sortable && 'cursor-pointer hover:bg-slate-50')}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-2">
                    {column.header}
                    {column.sortable && (
                      <div className="ml-auto">
                        {sortColumn === column.id ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900" />
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center text-body text-slate-500">
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row, index) => {
                const rowId = getRowId(row)
                const isSelected = selectedIds.has(rowId)
                return (
                  <motion.tr
                    key={String(rowId)}
                    className={cn(
                      'border-b border-slate-200/60 transition-colors hover:bg-slate-50',
                      isSelected && 'bg-blue-50',
                      onRowClick && 'cursor-pointer'
                    )}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectRow(rowId, checked as boolean)}
                          aria-label={`Select row ${rowId}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.id}>
                        {column.cell
                          ? column.cell(row)
                          : column.accessorFn
                          ? column.accessorFn(row)
                          : column.accessorKey
                          ? String(row[column.accessorKey])
                          : ''}
                      </TableCell>
                    ))}
                  </motion.tr>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

