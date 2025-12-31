'use client'

import { useEffect, useState, FormEvent, useMemo, useCallback, memo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  getAiScoreCategory,
  type PipelineStage,
} from '@/lib/constants'
import {
  Search,
  Plus,
  Filter,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  AlertCircle,
  Eye,
  X,
  TrendingUp,
  Clock,
  Flame,
  Snowflake,
  Sparkles,
  Users,
  KanbanSquare,
  List,
  Grid3x3,
} from 'lucide-react'
import { format } from 'date-fns'
import { LeadCard } from './components/LeadCard'
import { KanbanBoard } from '@/components/leads/KanbanBoard'

type Contact = {
  id: number
  fullName: string
  phone: string
  email?: string | null
  source?: string | null
}

type CommunicationLog = {
  id: number
  channel: string
  direction: string
  messageSnippet: string | null
  createdAt: string
}

type Lead = {
  id: number
  leadType: string | null
  status: string
  pipelineStage: string
  stage?: string
  priority?: string
  aiScore: number | null
  expiryDate: string | null
  nextFollowUpAt: string | null
  lastContactAt?: string | null
  lastContactChannel?: string | null
  assignedUserId?: number | null
  assignedUser?: { id: number; name: string; email: string } | null
  createdAt: string
  contact: Contact
  lastContact?: CommunicationLog | null
  expiryItems?: Array<{ id: number; type: string; expiryDate: string; renewalStatus?: string }>
  renewalProbability?: number | null
  estimatedRenewalValue?: string | null
}

type FilterType = 'all' | 'followups_today' | 'expiring_90' | 'overdue' | 'hot_only'

function LeadsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [aiScoreFilter, setAiScoreFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // PHASE 5F: View mode (list, grid, kanban)
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'kanban'>('grid')

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [source, setSource] = useState('manual')
  const [notes, setNotes] = useState('')
  const [serviceTypes, setServiceTypes] = useState<Array<{ id: number; name: string }>>([])

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('filter', filter)
      if (pipelineStageFilter) params.set('pipelineStage', pipelineStageFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      if (aiScoreFilter) params.set('aiScoreCategory', aiScoreFilter)

      const url = params.toString() ? `/api/leads?${params}` : '/api/leads'
      const res = await fetch(url)
      const data = await res.json()
      // Handle both old format (array) and new format (object with leads and pagination)
      setAllLeads(Array.isArray(data) ? data : (data.leads || []))
    } catch (err) {
      console.error(err)
      setError('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [filter, pipelineStageFilter, sourceFilter, aiScoreFilter])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  // Check for action=create in URL and open modal
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'create') {
      setShowCreateModal(true)
      // Clean up URL by removing the query parameter
      router.replace('/leads', { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    fetch('/api/service-types')
    .then((res) => res.json())
    .then((data) => setServiceTypes(data))
    .catch(() => {})
  }, [])

  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const leads = useMemo(() => {
    if (!debouncedSearch.trim()) return allLeads
    const query = debouncedSearch.toLowerCase()
    return allLeads.filter((lead) => {
      const name = lead.contact?.fullName?.toLowerCase() || ''
      const phone = lead.contact?.phone?.toLowerCase() || ''
      const email = lead.contact?.email?.toLowerCase() || ''
      return name.includes(query) || phone.includes(query) || email.includes(query)
    })
  }, [allLeads, debouncedSearch])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName || !phone) {
      setError('Full name and phone are required')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : null,
          source,
          notes,
        }),
      })

      if (!res.ok) throw new Error('Failed to create lead')

      setFullName('')
      setPhone('')
      setEmail('')
      setServiceTypeId('')
      setSource('manual')
      setNotes('')
      setShowCreateModal(false)
      await loadLeads()
    } catch (err) {
      setError('Error creating lead')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStage = useCallback(async (leadId: number, pipelineStage: string) => {
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStage }),
      })
      await loadLeads()
    } catch (err) {
      setError('Failed to update stage')
    }
  }, [loadLeads])

  // PHASE 5F: Handle stage change for Kanban (with PipelineStage type)
  const handleKanbanStageChange = useCallback(async (leadId: number, newStage: PipelineStage) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStage: newStage }),
      })

      if (!res.ok) {
        throw new Error('Failed to update stage')
      }

      // Optimistically update local state
      setAllLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, pipelineStage: newStage } : lead
        )
      )
    } catch (err) {
      console.error('Error updating stage:', err)
      // Reload on error
      await loadLeads()
      throw err
    }
  }, [loadLeads])

  async function handleSetFollowUp(leadId: number, days: number | 'custom') {
    try {
      let followUpDate: Date | null = null
      
      if (days === 'custom') {
        const dateStr = prompt('Enter follow-up date (YYYY-MM-DD):')
        if (!dateStr) return
        followUpDate = new Date(dateStr)
        if (isNaN(followUpDate.getTime())) {
          setError('Invalid date format')
          return
        }
      } else {
        followUpDate = new Date()
        followUpDate.setDate(followUpDate.getDate() + days)
      }
      
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextFollowUpAt: followUpDate.toISOString() }),
      })
      await loadLeads()
    } catch (err) {
      setError('Failed to set follow-up')
    }
  }

  function getFollowUpStatus(lead: Lead): 'today' | 'overdue' | 'scheduled' | 'none' {
    if (!lead.nextFollowUpAt) return 'none'
    
    const followUpDate = new Date(lead.nextFollowUpAt)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    followUpDate.setUTCHours(0, 0, 0, 0)
    
    const daysDiff = Math.ceil((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff < 0) return 'overdue'
    if (daysDiff === 0) return 'today'
    return 'scheduled'
  }

  function getNearestExpiry(lead: Lead): { type: string; expiryDate: string; daysUntil: number } | null {
    if (lead.expiryItems && lead.expiryItems.length > 0) {
      const nearest = lead.expiryItems[0]
      const expiryDate = new Date(nearest.expiryDate)
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      expiryDate.setUTCHours(0, 0, 0, 0)
      const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...nearest, daysUntil }
    }
    if (lead.expiryDate) {
      const expiryDate = new Date(lead.expiryDate)
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      expiryDate.setUTCHours(0, 0, 0, 0)
      const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { type: 'LEGACY_EXPIRY', expiryDate: lead.expiryDate, daysUntil }
    }
    return null
  }

  function getWhatsAppLink(phone: string, name: string) {
    // Navigate to inbox instead of external WhatsApp
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    return `/inbox?phone=${encodeURIComponent(cleanPhone)}`
  }

  function formatDate(date: string | null) {
    if (!date) return '—'
    return format(new Date(date), 'MMM dd, yyyy')
  }

  const formatSource = useCallback((source: string | null) => {
    if (!source) return 'Manual'
    return LEAD_SOURCE_LABELS[source as keyof typeof LEAD_SOURCE_LABELS] || source
  }, [])

  const getScoreBadgeVariant = useCallback((score: number | null): 'hot' | 'warm' | 'cold' | 'secondary' => {
    if (score === null) return 'secondary'
    return getAiScoreCategory(score)
  }, [])

  function getDaysUntilExpiry(expiryDate: string | null): number | null {
    if (!expiryDate) return null
    const expiry = new Date(expiryDate)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    expiry.setUTCHours(0, 0, 0, 0)
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <MainLayout>
      <div className="space-y-2">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* PHASE 5F: View Mode Toggle */}
            <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-800 rounded-lg p-1">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-7 px-2"
                title="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-7 px-2"
                title="Grid view"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('kanban')}
                className="h-7 px-2"
                title="Kanban view"
              >
                <KanbanSquare className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Lead
            </Button>
          </div>
        </div>

        {/* Compact Filters - Bento Box */}
        <BentoCard title="Filters & Search" icon={<Filter className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Quick Filter</label>
                <Select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as FilterType)}
                  className="h-8 text-xs"
                >
                  <option value="all">All</option>
                  <option value="followups_today">📅 Today</option>
                  <option value="expiring_90">⏰ 90d</option>
                  <option value="overdue">🚨 Overdue</option>
                  <option value="hot_only">🔥 Hot</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Stage</label>
                <Select
                  value={pipelineStageFilter}
                  onChange={(e) => setPipelineStageFilter(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="">All</option>
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {PIPELINE_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Source</label>
                <Select 
                  value={sourceFilter} 
                  onChange={(e) => setSourceFilter(e.target.value)} 
                  className="h-8 text-xs"
                >
                  <option value="">All</option>
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {LEAD_SOURCE_LABELS[src]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">AI Score</label>
                <Select 
                  value={aiScoreFilter} 
                  onChange={(e) => setAiScoreFilter(e.target.value)} 
                  className="h-8 text-xs"
                >
                  <option value="">All</option>
                  <option value="hot">🔥 Hot (70+)</option>
                  <option value="warm">🌡️ Warm (40-69)</option>
                  <option value="cold">❄️ Cold (&lt;40)</option>
                </Select>
              </div>

              {(pipelineStageFilter || sourceFilter || aiScoreFilter) && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">&nbsp;</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPipelineStageFilter('')
                      setSourceFilter('')
                      setAiScoreFilter('')
                    }}
                    className="h-8 w-full gap-1 text-xs"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* PHASE 5F: Leads View - List / Grid / Kanban */}
        {loading ? (
          viewMode === 'kanban' ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage} className="flex-shrink-0 w-80 bg-card rounded-lg border p-4">
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded mb-4 animate-pulse" />
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-3 w-full mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          )
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads found"
            description={
              searchQuery || pipelineStageFilter || sourceFilter || aiScoreFilter
                ? 'Try adjusting your filters to see more results.'
                : 'Get started by creating your first lead.'
            }
            action={
              !searchQuery && !pipelineStageFilter && !sourceFilter && !aiScoreFilter && (
                <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Lead
                </Button>
              )
            }
          />
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            leads={leads}
            onStageChange={handleKanbanStageChange}
            filters={{
              searchQuery,
              pipelineStage: pipelineStageFilter,
              source: sourceFilter,
              aiScore: aiScoreFilter,
            }}
          />
        ) : viewMode === 'list' ? (
          <div className="space-y-2">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onUpdateStage={handleUpdateStage}
                formatSource={formatSource}
                getNearestExpiry={getNearestExpiry as any}
                getScoreBadgeVariant={getScoreBadgeVariant}
                formatDate={formatDate}
                getWhatsAppLink={getWhatsAppLink}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onUpdateStage={handleUpdateStage}
                formatSource={formatSource}
                getNearestExpiry={getNearestExpiry as any}
                getScoreBadgeVariant={getScoreBadgeVariant}
                formatDate={formatDate}
                getWhatsAppLink={getWhatsAppLink}
              />
            ))}
          </div>
        )}

        {/* Create Lead Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">Create New Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name *</label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Phone *</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Service</label>
                  <Select
                    value={serviceTypeId}
                    onChange={(e) => setServiceTypeId(e.target.value)}
                  >
                    <option value="">Select service...</option>
                    {serviceTypes.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Source</label>
                  <Select value={source} onChange={(e) => setSource(e.target.value)}>
                    {LEAD_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {LEAD_SOURCE_LABELS[src]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Lead'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}

export default function LeadsPage() {
  return (
    <Suspense fallback={
      <MainLayout>
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </MainLayout>
    }>
      <LeadsPageContent />
    </Suspense>
  )
}
