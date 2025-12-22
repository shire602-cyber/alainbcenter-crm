'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { 
  RefreshCw, 
  Calendar, 
  AlertTriangle, 
  TrendingUp,
  Filter,
  ExternalLink,
  DollarSign
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface ExpiryItem {
  id: number
  type: string
  expiryDate: string
  renewalStatus: string
  lastReminderSentAt: string | null
  reminderCount: number
  lead: {
    id: number
    serviceTypeEnum: string | null
    assignedUser: {
      id: number
      name: string
    } | null
  } | null
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

interface KPIData {
  expiring90Days: number
  expiring30Days: number
  expiredNotRenewed: number
  renewalConversionRate: number
  projectedRevenue: number
}

export default function RenewalsDashboard() {
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [runningEngine, setRunningEngine] = useState(false)
  const [kpiData, setKpiData] = useState<KPIData>({
    expiring90Days: 0,
    expiring30Days: 0,
    expiredNotRenewed: 0,
    renewalConversionRate: 0,
    projectedRevenue: 0,
  })

  // Filters
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadRenewals()
  }, [])

  async function loadRenewals() {
    try {
      setLoading(true)
      const res = await fetch('/api/renewals')
      if (res.ok) {
        const data = await res.json()
        setExpiryItems(data.expiryItems || [])
        setKpiData(data.kpis || kpiData)
      }
    } catch (err) {
      console.error('Failed to load renewals:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRunEngine(dryRun: boolean = false) {
    try {
      setRunningEngine(true)
      console.log(`Starting renewal engine (dryRun=${dryRun})...`)
      
      const res = await fetch(`/api/renewals/run?dryRun=${dryRun}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ensure cookies are sent
      })

      console.log(`Response status: ${res.status}`)

      let result
      try {
        const text = await res.text()
        console.log('Response text:', text)
        result = JSON.parse(text)
      } catch (jsonError: any) {
        console.error('Failed to parse JSON response:', jsonError)
        console.error('Response status:', res.status)
        alert(`❌ Error: Failed to parse server response\n\nStatus: ${res.status}\n\nResponse may not be JSON.\n\nCheck console for details.`)
        return
      }

      if (res.ok) {
        let message = `Renewal Engine ${dryRun ? '(Dry Run)' : ''}:\n\n` +
          `✅ Checked: ${result.totalExpiryChecked}\n` +
          `✅ Scheduled: ${result.totalRemindersScheduled}\n` +
          `\nBy Stage:\n` +
          `  90D: ${result.byStage['90D']}\n` +
          `  60D: ${result.byStage['60D']}\n` +
          `  30D: ${result.byStage['30D']}\n` +
          `  7D: ${result.byStage['7D']}\n` +
          `  EXPIRED: ${result.byStage['EXPIRED']}`

        if (result.errors && result.errors.length > 0) {
          message += `\n\n⚠️ Errors (${result.errors.length}):\n`
          result.errors.slice(0, 5).forEach((err: string, idx: number) => {
            message += `  ${idx + 1}. ${err}\n`
          })
          if (result.errors.length > 5) {
            message += `  ... and ${result.errors.length - 5} more errors`
          }
        }

        alert(message)
        
        if (!dryRun) {
          await loadRenewals()
        }
      } else {
        const errorMsg = result.error || 'Failed to run engine'
        alert(`❌ Error: ${errorMsg}\n\nCheck console for details.`)
        console.error('Renewal engine API error:', result)
      }
    } catch (err: any) {
      console.error('Failed to run renewal engine:', err)
      alert(`❌ Network Error: ${err?.message || 'Failed to run renewal engine'}\n\nCheck console for details.`)
    } finally {
      setRunningEngine(false)
    }
  }

  // Filter and compute stages
  const filteredItems = expiryItems
    .map((item) => {
      const days = differenceInDays(parseISO(item.expiryDate), new Date())
      let stage: string = 'none'
      if (days < 0) {
        stage = 'EXPIRED'
      } else if (days <= 7) {
        stage = '7D'
      } else if (days <= 30) {
        stage = '30D'
      } else if (days <= 60) {
        stage = '60D'
      } else if (days <= 90) {
        stage = '90D'
      } else if (days <= 120) {
        stage = '120D'
      }

      return { 
        ...item, 
        computedStage: stage, 
        daysRemaining: days,
        estimatedRenewalValue: (item as any).estimatedRenewalValue,
        renewalProbability: (item as any).renewalProbability,
        projectedRevenue: (item as any).projectedRevenue,
      }
    })
    .filter((item) => {
      if (stageFilter !== 'all' && item.computedStage !== stageFilter) return false
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (statusFilter !== 'all' && item.renewalStatus !== statusFilter) return false
      if (assignedFilter !== 'all') {
        const assignedId = item.lead?.assignedUser?.id || item.assignedUser?.id
        if (assignedId?.toString() !== assignedFilter) return false
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (
          !item.contact.fullName.toLowerCase().includes(query) &&
          !item.contact.phone?.toLowerCase().includes(query) &&
          !item.type.toLowerCase().includes(query)
        ) {
          return false
        }
      }
      return true
    })

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'EXPIRED':
        return 'bg-red-100 text-red-800'
      case '7D':
        return 'bg-red-100 text-red-800'
      case '30D':
        return 'bg-orange-100 text-orange-800'
      case '60D':
        return 'bg-yellow-100 text-yellow-800'
      case '90D':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'RENEWED':
        return 'bg-green-100 text-green-800'
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800'
      case 'NOT_RENEWING':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  // Get unique types and assigned users for filters
  const uniqueTypes = Array.from(new Set(expiryItems.map((item) => item.type)))
  const uniqueUsers = Array.from(
    new Set(
      expiryItems
        .map((item) => item.lead?.assignedUser || item.assignedUser)
        .filter(Boolean)
        .map((u) => ({ id: u!.id, name: u!.name }))
    )
  )

  return (
    <MainLayout>
      <div className="space-y-2 bg-background">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Renewals</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Track expiring items and renewal opportunities
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRunEngine(true)}
              disabled={runningEngine}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", runningEngine && "animate-spin")} />
              Dry Run
            </Button>
            <Button
              size="sm"
              onClick={() => handleRunEngine(false)}
              disabled={runningEngine}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", runningEngine && "animate-spin")} />
              Run Engine
            </Button>
          </div>
        </div>

        {/* KPI Cards - Compact */}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <KPICard
            title="Expiring (90d)"
            value={kpiData.expiring90Days}
            icon={<Calendar className="h-4 w-4" />}
          />
          <KPICard
            title="Expiring (30d)"
            value={kpiData.expiring30Days}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <KPICard
            title="Expired"
            value={kpiData.expiredNotRenewed}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <KPICard
            title="Conversion"
            value={`${kpiData.renewalConversionRate.toFixed(1)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        {/* Filters & List */}
        <div className="grid gap-2 md:grid-cols-4">
          {/* Filters */}
          <BentoCard title="Filters" icon={<Filter className="h-4 w-4" />} className="md:col-span-1">
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Stage</label>
                <Select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="all">All</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="7D">7 Days</option>
                  <option value="30D">30 Days</option>
                  <option value="60D">60 Days</option>
                  <option value="90D">90 Days</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Status</label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="all">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RENEWED">Renewed</option>
                  <option value="NOT_RENEWING">Not Renewing</option>
                </Select>
              </div>

              <div className="relative">
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </BentoCard>

          {/* Expiry List */}
          <BentoCard title="Expiring Items" icon={<Calendar className="h-4 w-4" />} className="md:col-span-3">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No expiring items"
                description="All items are up to date."
              />
            ) : (
              <div className="space-y-1">
                {filteredItems.map((item) => {
                  const isUrgent = item.daysRemaining <= 7
                  return (
                    <Link
                      key={item.id}
                      href={`/leads/${item.lead?.id || item.contact.id}`}
                      className="block p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors flex-1">
                              {item.contact.fullName}
                            </p>
                            <Badge
                              variant={isUrgent ? 'destructive' : item.daysRemaining <= 30 ? 'default' : 'secondary'}
                              className="text-xs flex-shrink-0"
                            >
                              {item.daysRemaining < 0 
                                ? `${Math.abs(item.daysRemaining)}d overdue` 
                                : `${item.daysRemaining}d left`}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.type.replace(/_/g, ' ')} · Expires {format(parseISO(item.expiryDate), 'MMM d, yyyy')}
                          </p>
                          {item.projectedRevenue > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <DollarSign className="h-3 w-3 text-green-600" />
                              <span className="text-xs font-medium text-green-600">
                                AED {item.projectedRevenue.toLocaleString()}
                              </span>
                              {item.renewalProbability && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  ({item.renewalProbability}% prob)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </BentoCard>
        </div>
      </div>
    </MainLayout>
  )
}








