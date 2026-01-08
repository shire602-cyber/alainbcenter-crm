'use client'

/**
 * NEW LEADS PAGE - Table-first professional worklist
 * Modern, information-dense, actionable like respond.io/Odoo
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  List,
  KanbanSquare,
  Phone,
  MessageSquare,
  Mail,
  Eye,
  MoreVertical,
  X,
  Save,
  Trash2,
  UserPlus,
  RefreshCw,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  getAiScoreCategory,
} from '@/lib/constants'
import { useToast } from '@/components/ui/toast'
import { KanbanBoard } from '@/components/leads/KanbanBoard'

type Lead = {
  id: number
  pipelineStage: string
  aiScore: number | null
  createdAt: string
  contact: {
    id: number
    fullName: string
    phone: string
    email: string | null
    source: string | null
  }
  assignedUser: {
    id: number
    name: string
    email: string
  } | null
  serviceType: {
    id: number
    name: string
  } | null
  lastContact: {
    channel: string
    direction: string
    createdAt: string
  } | null
}

type User = {
  id: number
  name: string
  email: string
  role: string
}

export default function LeadsPageNew() {
  const router = useRouter()
  const { showToast } = useToast()
  
  // State
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [serviceTypes, setServiceTypes] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Filters
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pipelineStage, setPipelineStage] = useState('')
  const [source, setSource] = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [assignedToUserId, setAssignedToUserId] = useState('')
  const [aiScoreCategory, setAiScoreCategory] = useState('')
  const [createdAtFrom, setCreatedAtFrom] = useState('')
  const [createdAtTo, setCreatedAtTo] = useState('')
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  
  // Pagination
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  
  // Modals
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [showBulkStageModal, setShowBulkStageModal] = useState(false)
  const [showBulkOwnerModal, setShowBulkOwnerModal] = useState(false)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkStageValue, setBulkStageValue] = useState('')
  const [bulkOwnerValue, setBulkOwnerValue] = useState('')
  
  // Saved views
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; filters: any }>>([])
  const [showSaveViewModal, setShowSaveViewModal] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1) // Reset to first page on search
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Check user role
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data.user?.role?.toUpperCase() === 'ADMIN')
      })
      .catch(() => {})
  }, [])

  // Load users for filter
  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setUsers(data)
        }
      })
      .catch(() => {})
  }, [])

  // Load service types for filter
  useEffect(() => {
    fetch('/api/service-types')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setServiceTypes(data)
        }
      })
      .catch(() => {})
  }, [])

  // Load saved views from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('leads_saved_views')
      if (saved) {
        setSavedViews(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load saved views:', e)
    }
  }, [])

  // Save current filters as a view
  const saveCurrentView = () => {
    const view = {
      id: Date.now().toString(),
      name: saveViewName || `View ${savedViews.length + 1}`,
      filters: {
        query: debouncedQuery,
        pipelineStage,
        source,
        serviceTypeId,
        assignedToUserId,
        aiScoreCategory,
        createdAtFrom,
        createdAtTo,
      },
    }
    const updated = [...savedViews, view]
    setSavedViews(updated)
    localStorage.setItem('leads_saved_views', JSON.stringify(updated))
    setShowSaveViewModal(false)
    setSaveViewName('')
    showToast('View saved', 'success')
  }

  // Load a saved view
  const loadSavedView = (view: { filters: any }) => {
    setQuery(view.filters.query || '')
    setPipelineStage(view.filters.pipelineStage || '')
    setSource(view.filters.source || '')
    setServiceTypeId(view.filters.serviceTypeId || '')
    setAssignedToUserId(view.filters.assignedToUserId || '')
    setAiScoreCategory(view.filters.aiScoreCategory || '')
    setCreatedAtFrom(view.filters.createdAtFrom || '')
    setCreatedAtTo(view.filters.createdAtTo || '')
    setPage(1)
    showToast('View loaded', 'success')
  }

  // Delete a saved view
  const deleteSavedView = (id: string) => {
    const updated = savedViews.filter(v => v.id !== id)
    setSavedViews(updated)
    localStorage.setItem('leads_saved_views', JSON.stringify(updated))
    showToast('View deleted', 'success')
  }

  // Load leads
  const loadLeads = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (debouncedQuery) params.set('query', debouncedQuery)
      if (pipelineStage) params.set('pipelineStage', pipelineStage)
      if (source) params.set('source', source)
      if (serviceTypeId) params.set('serviceTypeId', serviceTypeId)
      if (assignedToUserId) params.set('assignedToUserId', assignedToUserId)
      if (aiScoreCategory) params.set('aiScoreCategory', aiScoreCategory)
      if (createdAtFrom) params.set('createdAtFrom', createdAtFrom)
      if (createdAtTo) params.set('createdAtTo', createdAtTo)
      
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      
      setLeads(data.leads || [])
      setTotal(data.pagination?.total || 0)
    } catch (error) {
      console.error('Failed to load leads:', error)
      showToast('Failed to load leads', 'error')
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, pipelineStage, source, serviceTypeId, assignedToUserId, aiScoreCategory, createdAtFrom, createdAtTo, page, limit, showToast])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  // Handle selection
  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
    setSelectAll(newSelected.size === leads.length && leads.length > 0)
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)))
    }
    setSelectAll(!selectAll)
  }

  // Bulk actions
  const handleBulkAction = async (action: string, data?: any) => {
    if (selectedIds.size === 0) {
      showToast('Please select leads first', 'error')
      return
    }

    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          leadIds: Array.from(selectedIds),
          data,
        }),
      })

      const result = await res.json()
      
      if (!res.ok) {
        throw new Error(result.error || 'Failed to perform bulk action')
      }

      showToast(`${result.updated} leads updated`, 'success')

      setSelectedIds(new Set())
      setSelectAll(false)
      loadLeads()
    } catch (error: any) {
      showToast(error.message || 'Failed to perform bulk action', 'error')
    }
  }

  // CSV Import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)

    // Preview
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/leads/import?preview=true', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (res.ok) {
        setImportPreview(data)
        setShowImportModal(true)
      } else {
        throw new Error(data.error || 'Failed to preview import')
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to preview import', 'error')
    }
  }

  const handleImport = async () => {
    if (!importFile) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', importFile)

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import leads')
      }

      showToast(`Imported ${data.results.created} leads`, 'success')

      setShowImportModal(false)
      setImportFile(null)
      setImportPreview(null)
      loadLeads()
    } catch (error: any) {
      showToast(error.message || 'Failed to import leads', 'error')
    } finally {
      setImporting(false)
    }
  }

  // CSV Export
  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      
      if (debouncedQuery) params.set('query', debouncedQuery)
      if (pipelineStage) params.set('pipelineStage', pipelineStage)
      if (source) params.set('source', source)
      if (serviceTypeId) params.set('serviceTypeId', serviceTypeId)
      if (assignedToUserId) params.set('assignedToUserId', assignedToUserId)
      if (aiScoreCategory) params.set('aiScoreCategory', aiScoreCategory)
      if (createdAtFrom) params.set('createdAtFrom', createdAtFrom)
      if (createdAtTo) params.set('createdAtTo', createdAtTo)
      
      if (selectedIds.size > 0) {
        params.set('ids', Array.from(selectedIds).join(','))
      }

      const res = await fetch(`/api/leads/export?${params}`)
      
      if (!res.ok) {
        throw new Error('Failed to export leads')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showToast('Leads exported successfully', 'success')
    } catch (error: any) {
      showToast(error.message || 'Failed to export leads', 'error')
    }
  }

  // Clear filters
  const clearFilters = () => {
    setQuery('')
    setPipelineStage('')
    setSource('')
    setServiceTypeId('')
    setAssignedToUserId('')
    setAiScoreCategory('')
    setCreatedAtFrom('')
    setCreatedAtTo('')
    setPage(1)
  }

  const hasActiveFilters = pipelineStage || source || serviceTypeId || assignedToUserId || aiScoreCategory || createdAtFrom || createdAtTo || debouncedQuery

  const getScoreBadge = (score: number | null) => {
    if (score === null) return null
    const category = getAiScoreCategory(score)
    const colors = {
      hot: 'bg-red-500 text-white',
      warm: 'bg-orange-500 text-white',
      cold: 'bg-blue-500 text-white',
    }
    return (
      <Badge className={colors[category]}>
        {score}
      </Badge>
    )
  }

  const getChannelIcon = (channel: string | null) => {
    if (!channel) return null
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4 text-green-600" />
      case 'email':
        return <Mail className="h-4 w-4 text-blue-600" />
      default:
        return <MessageSquare className="h-4 w-4 text-gray-600" />
    }
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {total} {total === 1 ? 'lead' : 'leads'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-8"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('kanban')}
                className="h-8"
              >
                <KanbanSquare className="h-4 w-4" />
              </Button>
            </div>

            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={loading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('import-file')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
                <input
                  id="import-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </>
            )}

            <Button onClick={() => router.push('/leads?action=create')}>
              <Plus className="h-4 w-4 mr-2" />
              New Lead
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2 p-4 bg-card border rounded-lg">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={pipelineStage} onChange={(e) => setPipelineStage(e.target.value)}>
            <option value="">All Stages</option>
            {PIPELINE_STAGES.map(stage => (
              <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>
            ))}
          </Select>

          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All Sources</option>
            {LEAD_SOURCES.map(src => (
              <option key={src} value={src}>{LEAD_SOURCE_LABELS[src]}</option>
            ))}
          </Select>

          <Select value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
            <option value="">All Owners</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </Select>

          <Select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>
            <option value="">All Services</option>
            {serviceTypes.map(st => (
              <option key={st.id} value={st.id.toString()}>{st.name}</option>
            ))}
          </Select>

          <Select value={aiScoreCategory} onChange={(e) => setAiScoreCategory(e.target.value)}>
            <option value="">All Scores</option>
            <option value="hot">Hot (75+)</option>
            <option value="warm">Warm (40-74)</option>
            <option value="cold">Cold (&lt;40)</option>
          </Select>

          <Input
            type="date"
            placeholder="From"
            value={createdAtFrom}
            onChange={(e) => setCreatedAtFrom(e.target.value)}
            className="w-[140px]"
          />

          <Input
            type="date"
            placeholder="To"
            value={createdAtTo}
            onChange={(e) => setCreatedAtTo(e.target.value)}
            className="w-[140px]"
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
          
          {/* Saved Views */}
          {savedViews.length > 0 && (
            <Select
              onChange={(e) => {
                if (e.target.value) {
                  const view = savedViews.find(v => v.id === e.target.value)
                  if (view) loadSavedView(view)
                  e.target.value = ''
                }
              }}
              defaultValue=""
              className="w-[140px]"
            >
              <option value="">Saved Views...</option>
              {savedViews.map(view => (
                <option key={view.id} value={view.id}>{view.name}</option>
              ))}
            </Select>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveViewModal(true)}
            disabled={!hasActiveFilters}
          >
            <Save className="h-4 w-4 mr-2" />
            Save View
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium">
              {selectedIds.size} {selectedIds.size === 1 ? 'lead' : 'leads'} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Select
                onChange={(e) => {
                  const action = e.target.value
                  if (action === 'change-stage') {
                    setShowBulkStageModal(true)
                  } else if (action === 'assign-owner') {
                    setShowBulkOwnerModal(true)
                  } else if (action === 'delete') {
                    setShowBulkDeleteModal(true)
                  }
                  // Reset select
                  e.target.value = ''
                }}
                defaultValue=""
              >
                <option value="">Bulk Actions...</option>
                <option value="change-stage">Change Stage</option>
                <option value="assign-owner">Assign Owner</option>
                {isAdmin && <option value="delete">Delete</option>}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const params = new URLSearchParams()
                  params.set('ids', Array.from(selectedIds).join(','))
                  const res = await fetch(`/api/leads/export?${params}`)
                  if (res.ok) {
                    const blob = await res.blob()
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `leads-selected-${new Date().toISOString().split('T')[0]}.csv`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    window.URL.revokeObjectURL(url)
                    showToast('Selected leads exported', 'success')
                  } else {
                    showToast('Failed to export', 'error')
                  }
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedIds(new Set())
                  setSelectAll(false)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="border rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="p-12">
                <EmptyState
                  icon={List}
                  title="No leads found"
                  description={hasActiveFilters ? "No leads match your current filters" : "Get started by creating your first lead"}
                  action={hasActiveFilters ? (
                    <Button onClick={clearFilters} variant="outline">
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  ) : (
                    <Button onClick={() => router.push('/leads?action=create')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Lead
                    </Button>
                  )}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectAll}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Last Message</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{lead.contact.fullName}</div>
                          <div className="text-sm text-muted-foreground">{lead.contact.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getChannelIcon(lead.lastContact?.channel || null)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PIPELINE_STAGE_LABELS[lead.pipelineStage as keyof typeof PIPELINE_STAGE_LABELS] || lead.pipelineStage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {lead.serviceType?.name || '—'}
                      </TableCell>
                      <TableCell>
                        {lead.assignedUser?.name || '—'}
                      </TableCell>
                      <TableCell>
                        {lead.lastContact ? (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {lead.lastContact.direction === 'INBOUND' || lead.lastContact.direction === 'IN' ? 'Received' : 'Sent'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(lead.lastContact.createdAt), { addSuffix: true })}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {getScoreBadge(lead.aiScore)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {LEAD_SOURCE_LABELS[lead.contact.source as keyof typeof LEAD_SOURCE_LABELS] || lead.contact.source || 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {lead.contact.phone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`tel:${lead.contact.phone}`)}
                              className="h-8 w-8 p-0"
                            >
                              <Phone className="h-4 w-4" />
                            </Button>
                          )}
                          {lead.contact.phone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/inbox?phone=${encodeURIComponent(lead.contact.phone)}`)}
                              className="h-8 w-8 p-0"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {!loading && leads.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} leads
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page} of {Math.ceil(total / limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
                    disabled={page >= Math.ceil(total / limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Kanban View */}
        {viewMode === 'kanban' && (
          <div>
            {loading ? (
              <div className="flex gap-4">
                {PIPELINE_STAGES.map(stage => (
                  <div key={stage} className="flex-1">
                    <Skeleton className="h-96" />
                  </div>
                ))}
              </div>
            ) : (
              <KanbanBoard
                leads={leads as any}
                onStageChange={async (leadId, newStage) => {
                  try {
                    await fetch(`/api/leads/${leadId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ pipelineStage: newStage }),
                    })
                    loadLeads()
                  } catch (error) {
                    showToast('Failed to update stage', 'error')
                  }
                }}
                filters={{}}
              />
            )}
          </div>
        )}

        {/* Bulk Stage Change Modal */}
        <Dialog open={showBulkStageModal} onOpenChange={setShowBulkStageModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Stage for {selectedIds.size} Lead(s)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={bulkStageValue} onChange={(e) => setBulkStageValue(e.target.value)}>
                <option value="">Select Stage</option>
                {PIPELINE_STAGES.map(stage => (
                  <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>
                ))}
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowBulkStageModal(false)
                  setBulkStageValue('')
                }}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  if (bulkStageValue) {
                    await handleBulkAction('change-stage', { pipelineStage: bulkStageValue })
                    setShowBulkStageModal(false)
                    setBulkStageValue('')
                  }
                }} disabled={!bulkStageValue}>
                  Update
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Owner Assignment Modal */}
        <Dialog open={showBulkOwnerModal} onOpenChange={setShowBulkOwnerModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Owner for {selectedIds.size} Lead(s)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={bulkOwnerValue} onChange={(e) => setBulkOwnerValue(e.target.value)}>
                <option value="">Unassign (No Owner)</option>
                {users.map(user => (
                  <option key={user.id} value={user.id.toString()}>{user.name}</option>
                ))}
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowBulkOwnerModal(false)
                  setBulkOwnerValue('')
                }}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  await handleBulkAction('assign-owner', {
                    assignedUserId: bulkOwnerValue ? parseInt(bulkOwnerValue) : null
                  })
                  setShowBulkOwnerModal(false)
                  setBulkOwnerValue('')
                }}>
                  Update
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Modal */}
        <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {selectedIds.size} Lead(s)?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. Are you sure you want to delete {selectedIds.size} lead(s)?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowBulkDeleteModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await handleBulkAction('delete')
                    setShowBulkDeleteModal(false)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Save View Modal */}
        <Dialog open={showSaveViewModal} onOpenChange={setShowSaveViewModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Current View</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder="View name (e.g., 'Hot Leads', 'My Pipeline')"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveViewName.trim()) {
                    saveCurrentView()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowSaveViewModal(false)
                  setSaveViewName('')
                }}>
                  Cancel
                </Button>
                <Button onClick={saveCurrentView} disabled={!saveViewName.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Import Modal */}
        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import Preview</DialogTitle>
            </DialogHeader>
            {importPreview && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Total Rows</div>
                    <div>{importPreview.totalRows}</div>
                  </div>
                  <div>
                    <div className="font-medium">Will Create</div>
                    <div className="text-green-600">{importPreview.willCreate}</div>
                  </div>
                  <div>
                    <div className="font-medium">Will Skip</div>
                    <div className="text-red-600">{importPreview.willSkip}</div>
                  </div>
                </div>
                
                <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Phone</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.preview.map((item: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{item.name}</td>
                          <td className="p-2">{item.phone}</td>
                          <td className="p-2">
                            {item.willCreate ? (
                              <Badge variant="default">Will Create</Badge>
                            ) : (
                              <Badge variant="destructive">{item.reason}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowImportModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? 'Importing...' : 'Import'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

