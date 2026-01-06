'use client'

import { useState, useEffect, useMemo } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import {
  RefreshCw,
  Calendar,
  AlertTriangle,
  DollarSign,
  Filter,
  X,
  Search,
  Phone,
  Mail,
  ExternalLink,
  MoreVertical,
  TrendingUp,
  Clock,
  User,
  FileText,
  MessageSquare,
  Receipt,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Send,
  Plus,
  Download,
  Upload,
} from 'lucide-react'
import { format, differenceInDays, parseISO, addDays } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface RenewalItem {
  id: number
  leadId: number
  serviceType: string
  serviceName: string | null
  expiresAt: string
  status: string
  expectedValue: number | null
  probability: number
  assignedToUserId: number | null
  lastContactedAt: string | null
  nextActionAt: string | null
  notes: string | null
  lead: {
    id: number
    contact: {
      id: number
      fullName: string
      phone: string | null
    }
    assignedUser: {
      id: number
      name: string
    } | null
  }
  assignedTo: {
    id: number
    name: string
  } | null
  daysRemaining?: number
  projectedRevenue?: number | null
}

interface RenewalEvent {
  id: number
  type: string
  channel: string | null
  payload: any
  createdAt: string
  createdBy: {
    id: number
    name: string
  } | null
}

interface KPIData {
  revenueAtRisk30: number
  revenueAtRisk60: number
  revenueAtRisk90: number
  urgentCount: number
  expiredNotContacted: number
  recoveredThisMonth: number
}

type UrgencyLevel = 'urgent' | 'expired' | 'action' | 'upcoming'

export default function RenewalCommandCenter() {
  const router = useRouter()
  const { showToast } = useToast()
  
  const [renewalItems, setRenewalItems] = useState<RenewalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<RenewalItem | null>(null)
  const [selectedItemEvents, setSelectedItemEvents] = useState<RenewalEvent[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [runningEngine, setRunningEngine] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  
  // Filters
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [daysRemainingRange, setDaysRemainingRange] = useState<[number, number]>([-365, 365])
  const [notContactedOnly, setNotContactedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Edit form state
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [editExpectedValue, setEditExpectedValue] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editAssignedTo, setEditAssignedTo] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Timeline note state
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  
  const [kpiData, setKpiData] = useState<KPIData>({
    revenueAtRisk30: 0,
    revenueAtRisk60: 0,
    revenueAtRisk90: 0,
    urgentCount: 0,
    expiredNotContacted: 0,
    recoveredThisMonth: 0,
  })

  useEffect(() => {
    // Load user role
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        const role = data.user?.role?.toUpperCase() || ''
        setUserRole(role)
        setIsAdmin(role === 'ADMIN')
      })
      .catch(() => {})
    
    // Load users for assignment dropdown
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.users) {
          setUsers(data.users)
        }
      })
      .catch(() => {})
    
    loadRenewals()
  }, [])

  async function loadRenewals() {
    try {
      setLoading(true)
      
      // Build query params
      const params = new URLSearchParams()
      if (serviceTypeFilter !== 'all') params.append('serviceType', serviceTypeFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (assignedFilter !== 'all') params.append('assignedToUserId', assignedFilter)
      if (notContactedOnly) params.append('notContacted', 'true')
      if (searchQuery) params.append('search', searchQuery)
      if (daysRemainingRange[0] !== -365) params.append('daysRemainingMin', daysRemainingRange[0].toString())
      if (daysRemainingRange[1] !== 365) params.append('daysRemainingMax', daysRemainingRange[1].toString())
      
      const res = await fetch(`/api/renewals-v2?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRenewalItems(data.items || [])
        setKpiData(data.summary || kpiData)
      } else {
        showToast('Failed to load renewals', 'error')
      }
    } catch (err) {
      console.error('Failed to load renewals:', err)
      showToast('Failed to load renewals', 'error')
    } finally {
      setLoading(false)
    }
  }
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadRenewals()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])
  
  // Reload when filters change (but not search - handled separately)
  useEffect(() => {
    if (searchQuery === '') {
      loadRenewals()
    }
  }, [serviceTypeFilter, statusFilter, assignedFilter, notContactedOnly, daysRemainingRange])
  
  async function loadRenewalDetail(itemId: number) {
    try {
      setDrawerLoading(true)
      const [itemRes, eventsRes] = await Promise.all([
        fetch(`/api/renewals-v2/${itemId}`),
        fetch(`/api/renewals-v2/${itemId}/events`),
      ])
      
      if (itemRes.ok) {
        const itemData = await itemRes.json()
        setSelectedItem(itemData)
        
        // Initialize edit form
        setEditExpiresAt(format(parseISO(itemData.expiresAt), 'yyyy-MM-dd'))
        setEditExpectedValue(itemData.expectedValue?.toString() || '')
        setEditStatus(itemData.status)
        setEditAssignedTo(itemData.assignedToUserId?.toString() || '')
      }
      
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json()
        setSelectedItemEvents(eventsData.events || [])
      }
    } catch (err) {
      console.error('Failed to load renewal detail:', err)
      showToast('Failed to load renewal details', 'error')
    } finally {
      setDrawerLoading(false)
    }
  }

  // Sort and filter items (server-side filtering already done, but client-side search still needed)
  const filteredItems = useMemo(() => {
    if (!searchQuery) return renewalItems
    
    const query = searchQuery.toLowerCase()
    return renewalItems.filter((item) => {
      const name = item.lead?.contact?.fullName?.toLowerCase() || ''
      const phone = item.lead?.contact?.phone?.toLowerCase() || ''
      return name.includes(query) || phone.includes(query)
    })
  }, [renewalItems, searchQuery])
  
  const sortedItems = useMemo(() => {
    const now = new Date()
    
    const itemsWithUrgency = filteredItems.map((item) => {
      const days = item.daysRemaining ?? differenceInDays(parseISO(item.expiresAt), now)
      let urgency: UrgencyLevel = 'upcoming'
      
      if (days <= 14 && days >= 0) urgency = 'urgent'
      else if (days < 0) urgency = 'expired'
      else if (days <= 30) urgency = 'action'
      
      return { ...item, urgency, daysRemaining: days }
    })
    
    // Sort by urgency priority
    const urgencyOrder: Record<UrgencyLevel, number> = {
      urgent: 0,
      expired: 1,
      action: 2,
      upcoming: 3,
    }
    
    return itemsWithUrgency.sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      if (urgencyDiff !== 0) return urgencyDiff
      return a.daysRemaining - b.daysRemaining
    })
  }, [filteredItems])
  
  async function handleSaveChanges() {
    if (!selectedItem) return
    
    try {
      setSaving(true)
      const res = await fetch(`/api/renewals-v2/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
          expectedValue: editExpectedValue ? parseInt(editExpectedValue) : null,
          status: editStatus,
          assignedToUserId: editAssignedTo ? parseInt(editAssignedTo) : null,
        }),
      })
      
      if (res.ok) {
        showToast('Changes saved successfully', 'success')
        await loadRenewalDetail(selectedItem.id)
        await loadRenewals()
      } else {
        throw new Error('Failed to save')
      }
    } catch (err) {
      showToast('Failed to save changes', 'error')
    } finally {
      setSaving(false)
    }
  }
  
  async function handleAddNote() {
    if (!selectedItem || !newNote.trim()) return
    
    try {
      setAddingNote(true)
      const res = await fetch(`/api/renewals-v2/${selectedItem.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote }),
      })
      
      if (res.ok) {
        showToast('Note added', 'success')
        setNewNote('')
        await loadRenewalDetail(selectedItem.id)
      } else {
        throw new Error('Failed to add note')
      }
    } catch (err) {
      showToast('Failed to add note', 'error')
    } finally {
      setAddingNote(false)
    }
  }
  
  async function handleSnooze(days: number) {
    if (!selectedItem) return
    
    try {
      const nextActionAt = addDays(new Date(), days).toISOString()
      const res = await fetch(`/api/renewals-v2/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextActionAt }),
      })
      
      if (res.ok) {
        showToast(`Snoozed for ${days} days`, 'success')
        await loadRenewalDetail(selectedItem.id)
        await loadRenewals()
      }
    } catch (err) {
      showToast('Failed to snooze', 'error')
    }
  }
  
  async function handleCall(item: RenewalItem) {
    const phone = item.lead?.contact?.phone
    if (phone) {
      // Copy to clipboard
      navigator.clipboard.writeText(phone)
      showToast('Phone number copied to clipboard', 'success')
      
      // Log CONTACTED event
      try {
        await fetch(`/api/renewals-v2/${item.id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            note: `Called ${phone}`,
            markAsContacted: true,
          }),
        })
      } catch (err) {
        // Silent fail
      }
    }
  }
  
  async function handleRunEngine(dryRun: boolean) {
    if (!isAdmin) return
    
    try {
      setRunningEngine(true)
      const endpoint = dryRun ? '/api/renewals/engine/dry-run' : '/api/renewals/engine/run'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowDays: 30,
          onlyNotContacted: true,
        }),
      })
      
      const data = await res.json()
      
      if (dryRun) {
        showToast(
          `Dry run: ${data.totals.sendCount} would send, ${data.totals.skipCount} skipped`,
          'info'
        )
      } else {
        showToast(
          `Engine ran: ${data.summary.sent} sent, ${data.summary.failed} failed`,
          data.summary.failed > 0 ? 'warning' : 'success'
        )
        await loadRenewals()
      }
    } catch (err) {
      showToast('Engine run failed', 'error')
    } finally {
      setRunningEngine(false)
    }
  }
  
  function handleRowClick(item: RenewalItem) {
    setSelectedItem(item)
    setDrawerOpen(true)
    loadRenewalDetail(item.id)
  }

  // Sort and filter items
  const sortedAndFilteredItems = useMemo(() => {
    const now = new Date()
    
    // Calculate urgency and sort
    const itemsWithUrgency = expiryItems
      .map((item) => {
        const days = item.daysRemaining ?? differenceInDays(parseISO(item.expiryDate), now)
        let urgency: UrgencyLevel = 'upcoming'
        
        if (days <= 14 && days >= 0) urgency = 'urgent'
        else if (days < 0) urgency = 'expired'
        else if (days <= 30) urgency = 'action'
        
        return { ...item, urgency, daysRemaining: days }
      })
      .filter((item) => {
        // Service type filter
        if (serviceTypeFilter !== 'all') {
          const serviceType = item.type
          if (!serviceType.toLowerCase().includes(serviceTypeFilter.toLowerCase())) {
            return false
          }
        }
        
        // Status filter
        if (statusFilter !== 'all' && item.renewalStatus !== statusFilter) {
          return false
        }
        
        // Assigned filter
        if (assignedFilter !== 'all') {
          const assignedId = item.lead?.assignedUser?.id || item.assignedUser?.id
          if (assignedId?.toString() !== assignedFilter) return false
        }
        
        // Days remaining range
        if (item.daysRemaining < daysRemainingRange[0] || item.daysRemaining > daysRemainingRange[1]) {
          return false
        }
        
        // Not contacted filter
        if (notContactedOnly && item.lastReminderSentAt) {
          return false
        }
        
        // Search
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesName = item.contact.fullName?.toLowerCase().includes(query)
          const matchesPhone = item.contact.phone?.toLowerCase().includes(query)
          const matchesType = item.type.toLowerCase().includes(query)
          if (!matchesName && !matchesPhone && !matchesType) {
            return false
          }
        }
        
        return true
      })
    
    // Sort by urgency priority
    const urgencyOrder: Record<UrgencyLevel, number> = {
      urgent: 0,
      expired: 1,
      action: 2,
      upcoming: 3,
    }
    
    return itemsWithUrgency.sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      if (urgencyDiff !== 0) return urgencyDiff
      return a.daysRemaining - b.daysRemaining
    })
  }, [expiryItems, serviceTypeFilter, statusFilter, assignedFilter, daysRemainingRange, notContactedOnly, searchQuery])


  const getUrgencyBadge = (urgency: UrgencyLevel, days: number) => {
    switch (urgency) {
      case 'urgent':
        return <Badge variant="destructive" className="text-xs">Urgent ({days}d)</Badge>
      case 'expired':
        return <Badge variant="destructive" className="text-xs bg-red-600">Expired ({Math.abs(days)}d)</Badge>
      case 'action':
        return <Badge className="text-xs bg-orange-500">Action ({days}d)</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">Upcoming ({days}d)</Badge>
    }
  }

  const clearFilters = () => {
    setServiceTypeFilter('all')
    setStatusFilter('all')
    setAssignedFilter('all')
    setDaysRemainingRange([-365, 365])
    setNotContactedOnly(false)
    setSearchQuery('')
  }

  const hasActiveFilters = serviceTypeFilter !== 'all' || 
    statusFilter !== 'all' || 
    assignedFilter !== 'all' ||
    daysRemainingRange[0] !== -365 ||
    daysRemainingRange[1] !== 365 ||
    notContactedOnly ||
    searchQuery !== ''

  return (
    <MainLayout>
      <div className="h-screen flex flex-col bg-background">
        {/* Sticky Top Command Bar */}
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Renewal Command Center
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Track and manage renewal opportunities
                </p>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunEngine(false)}
                      disabled={runningEngine}
                      className="gap-2"
                    >
                      <RefreshCw className={cn("h-4 w-4", runningEngine && "animate-spin")} />
                      Run Follow-up Engine
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunEngine(true)}
                      disabled={runningEngine}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Dry Run
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={true}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  </>
                )}
                {!isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={true}
                      className="gap-2 opacity-50"
                      title="Admin only"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Run Follow-up Engine
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={true}
                      className="gap-2 opacity-50"
                      title="Admin only"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Dry Run
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* KPI Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Revenue at Risk (30d)</p>
                <p className="text-lg font-semibold text-red-900 dark:text-red-100">
                  AED {kpiData.revenueAtRisk30.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">Revenue at Risk (60d)</p>
                <p className="text-lg font-semibold text-orange-900 dark:text-orange-100">
                  AED {kpiData.revenueAtRisk60.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">Revenue at Risk (90d)</p>
                <p className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
                  AED {kpiData.revenueAtRisk90.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Urgent (≤14d)</p>
                <p className="text-lg font-semibold text-red-900 dark:text-red-100">
                  {kpiData.urgentCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-400 mb-1">Expired & Not Contacted</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {kpiData.expiredNotContacted}
                </p>
              </div>
            </div>
            
            <div className="mt-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Recovered This Month</p>
                  <p className="text-xl font-semibold text-green-900 dark:text-green-100">
                    AED {kpiData.recoveredThisMonth.toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Filter Panel */}
          <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </h2>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-6 px-2 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>

              {/* Service Type */}
              <div>
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Service Type
                </Label>
                <Select
                  value={serviceTypeFilter}
                  onChange={(e) => setServiceTypeFilter(e.target.value)}
                  className="h-9 text-sm"
                >
                  <option value="all">All Services</option>
                  <option value="TRADE_LICENSE">Trade License</option>
                  <option value="EMIRATES_ID">Emirates ID</option>
                  <option value="RESIDENCY">Residency</option>
                  <option value="VISIT_VISA">Visit Visa</option>
                  <option value="CHANGE_STATUS">Change Status</option>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Status
                </Label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTION_REQUIRED">Action Required</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUOTED">Quoted</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RENEWED">Renewed</option>
                  <option value="LOST">Lost</option>
                </Select>
              </div>

              {/* Assigned To */}
              <div>
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Assigned To
                </Label>
                <Select
                  value={assignedFilter}
                  onChange={(e) => setAssignedFilter(e.target.value)}
                  className="h-9 text-sm"
                >
                  <option value="all">Everyone</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id.toString()}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Days Remaining Filter - Quick selects */}
              <div>
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Days Remaining
                </Label>
                <div className="space-y-1">
                  <Button
                    variant={daysRemainingRange[1] <= 14 ? "default" : "outline"}
                    size="sm"
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => setDaysRemainingRange([-365, 14])}
                  >
                    ≤ 14 days (Urgent)
                  </Button>
                  <Button
                    variant={daysRemainingRange[0] < 0 && daysRemainingRange[1] === 0 ? "default" : "outline"}
                    size="sm"
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => setDaysRemainingRange([-365, 0])}
                  >
                    Expired
                  </Button>
                  <Button
                    variant={daysRemainingRange[0] === -365 && daysRemainingRange[1] === 365 ? "default" : "outline"}
                    size="sm"
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => setDaysRemainingRange([-365, 365])}
                  >
                    All
                  </Button>
                </div>
              </div>

              {/* Not Contacted Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="not-contacted"
                  checked={notContactedOnly}
                  onChange={(e) => setNotContactedOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Label htmlFor="not-contacted" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Not Contacted Only
                </Label>
              </div>

              {/* Search */}
              <div>
                <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Center Renewal Queue */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
            <div className="p-4">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : sortedItems.length === 0 ? (
                <Card className="p-12 text-center">
                  <Filter className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                    No renewals match filters
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Try adjusting your filter criteria
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="space-y-2">
                  {sortedItems.map((item) => {
                    const urgency = item.urgency || 'upcoming'
                    const days = item.daysRemaining ?? 0
                    const revenue = item.projectedRevenue || 0
                    
                    return (
                      <Card
                        key={item.id}
                        className="p-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/20"
                        onClick={() => handleRowClick(item)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {getUrgencyBadge(urgency, days)}
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {item.lead?.contact?.fullName || 'Unknown'}
                              </h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400">
                              <div>
                                <span className="font-medium">Service:</span> {item.serviceType.replace(/_/g, ' ')}
                              </div>
                              <div>
                                <span className="font-medium">Expires:</span> {format(parseISO(item.expiresAt), 'MMM d, yyyy')}
                              </div>
                              <div>
                                <span className="font-medium">Phone:</span> {item.lead?.contact?.phone || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Owner:</span> {item.assignedTo?.name || item.lead?.assignedUser?.name || 'Unassigned'}
                              </div>
                            </div>

                            {item.lastContactedAt && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                Last contacted: {format(parseISO(item.lastContactedAt), 'MMM d, yyyy')}
                              </div>
                            )}

                            {revenue > 0 && (
                              <div className="mt-2 flex items-center gap-1">
                                <DollarSign className="h-3 w-3 text-green-600" />
                                <span className="text-xs font-semibold text-green-600">
                                  AED {revenue.toLocaleString()}
                                </span>
                                {item.probability && (
                                  <span className="text-xs text-slate-500">
                                    ({item.probability}% prob)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (item.leadId) {
                                  window.open(`/leads/${item.leadId}`, '_blank')
                                }
                              }}
                              disabled={!item.leadId}
                              className="h-8"
                              title="Open Lead"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCall(item)
                              }}
                              disabled={!item.lead?.contact?.phone}
                              className="h-8"
                              title="Copy Phone"
                            >
                              <Phone className="h-3 w-3" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="right" className="w-full sm:w-[540px] overflow-y-auto">
            {drawerLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : selectedItem ? (
              <>
                <SheetHeader>
                  <SheetTitle>{selectedItem.lead?.contact?.fullName || 'Renewal Details'}</SheetTitle>
                </SheetHeader>

                {/* Action Buttons */}
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedItem.lead?.contact?.phone) {
                        router.push(`/inbox?phone=${encodeURIComponent(selectedItem.lead.contact.phone)}`)
                      }
                    }}
                    disabled={!selectedItem.lead?.contact?.phone}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Send Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCall(selectedItem)}
                    disabled={!selectedItem.lead?.contact?.phone}
                    className="gap-2"
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSnooze(7)}
                    className="gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Snooze 7d
                  </Button>
                </div>

                <Tabs defaultValue="summary" className="mt-6">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                    <TabsTrigger value="quote">Quote</TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="mt-4 space-y-4">
                    <Card className="p-4">
                      <h3 className="font-semibold mb-4">Key Information</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Expires At:</span>
                          <span className="font-medium">{format(parseISO(selectedItem.expiresAt), 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Days Remaining:</span>
                          <span className="font-medium">{selectedItem.daysRemaining ?? 0} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Expected Value:</span>
                          <span className="font-medium">
                            {selectedItem.expectedValue ? `AED ${selectedItem.expectedValue.toLocaleString()}` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Status:</span>
                          <Badge variant={selectedItem.status === 'RENEWED' ? 'default' : 'secondary'}>
                            {selectedItem.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Assigned To:</span>
                          <span className="font-medium">
                            {selectedItem.assignedTo?.name || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-semibold mb-4">Edit Details</h3>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Expires At</Label>
                          <Input 
                            type="date" 
                            className="mt-1" 
                            value={editExpiresAt}
                            onChange={(e) => setEditExpiresAt(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Expected Value (AED)</Label>
                          <Input 
                            type="number" 
                            className="mt-1" 
                            value={editExpectedValue}
                            onChange={(e) => setEditExpectedValue(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Status</Label>
                          <Select 
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="mt-1"
                          >
                            <option value="UPCOMING">Upcoming</option>
                            <option value="ACTION_REQUIRED">Action Required</option>
                            <option value="URGENT">Urgent</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="CONTACTED">Contacted</option>
                            <option value="QUOTED">Quoted</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="RENEWED">Renewed</option>
                            <option value="LOST">Lost</option>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Assigned To</Label>
                          <Select 
                            value={editAssignedTo}
                            onChange={(e) => setEditAssignedTo(e.target.value)}
                            className="mt-1"
                          >
                            <option value="">Unassigned</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id.toString()}>
                                {user.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={handleSaveChanges}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-4 space-y-4">
                    <Card className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Timeline</h3>
                      </div>
                      
                      {/* Add Note */}
                      <div className="mb-4 space-y-2">
                        <Input
                          placeholder="Add a note..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleAddNote()
                            }
                          }}
                        />
                        <Button 
                          size="sm" 
                          onClick={handleAddNote}
                          disabled={!newNote.trim() || addingNote}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {addingNote ? 'Adding...' : 'Add Note'}
                        </Button>
                      </div>
                      
                      {/* Events List */}
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {selectedItemEvents.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            No events yet
                          </p>
                        ) : (
                          selectedItemEvents.map((event) => (
                            <div 
                              key={event.id} 
                              className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="flex items-start justify-between mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {event.type}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  {format(parseISO(event.createdAt), 'MMM d, HH:mm')}
                                </span>
                              </div>
                              {event.payload?.note && (
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                                  {event.payload.note}
                                </p>
                              )}
                              {event.createdBy && (
                                <p className="text-xs text-slate-500 mt-1">
                                  by {event.createdBy.name}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="messages" className="mt-4">
                    <Card className="p-4">
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          View all messages in the inbox
                        </p>
                        {selectedItem.lead?.contact?.phone ? (
                          <Link href={`/inbox?phone=${encodeURIComponent(selectedItem.lead.contact.phone)}`}>
                            <Button className="w-full" variant="default">
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Jump to Inbox
                            </Button>
                          </Link>
                        ) : (
                          <p className="text-xs text-slate-500">No phone number available</p>
                        )}
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="quote" className="mt-4">
                    <Card className="p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-8">
                        Quote view coming soon
                      </p>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    </MainLayout>
  )
}

