'use client'

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import {
  BarChart3,
  TrendingUp,
  Users,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Target,
  Zap,
  Calendar,
  MessageSquare,
  UserCheck,
  Timer,
  Award,
} from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'

type KPIData = {
  conversion: {
    totalLeads: number
    wonLeads: number
    lostLeads: number
    inProgressLeads: number
    conversionRate: number
  }
  processing: {
    avgProcessingTimeDays: number
    avgResponseTimeMinutes: number
  }
  expiry: {
    expiringSoon: number
    overdueLeads: number
  }
  activity: {
    recentLeads30Days: number
    recentWon30Days: number
  }
  tasks: {
    total: number
    completed: number
    completionRate: number
  }
  serviceTypes: Array<{
    name: string
    total: number
    won: number
    inProgress: number
    conversionRate: number
  }>
  channels: Array<{
    channel: string
    total: number
    won: number
    conversionRate: number
  }>
}

type UserPerformance = {
  userId: number
  userName: string
  userEmail: string
  userRole: string
  metrics: {
    totalLeads: number
    wonLeads: number
    inProgressLeads: number
    newLeads: number
    conversionRate: number
    avgResponseTimeMinutes: number
    totalTasks: number
    completedTasks: number
    taskCompletionRate: number
    messagesSent30Days: number
    recentActivity30Days: number
    avgProcessingTimeDays: number
  }
}

export default function ReportsPage() {
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [userPerformance, setUserPerformance] = useState<UserPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      console.log('[Reports Page] Loading data...')
      const [kpisRes, usersRes] = await Promise.allSettled([
        fetch('/api/reports/kpis', { 
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        fetch('/api/reports/users', { 
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ])
      console.log('[Reports Page] Fetch completed:', {
        kpisStatus: kpisRes.status,
        usersStatus: usersRes.status,
      })

      // Handle KPIs response
      if (kpisRes.status === 'rejected') {
        const errorMsg = `KPIs request failed: ${kpisRes.reason || 'Network error'}`
        console.error('[Reports Page] KPIs request rejected:', errorMsg, kpisRes.reason)
        setError(errorMsg)
      } else if (kpisRes.status === 'fulfilled') {
        const res = kpisRes.value
        console.log('[Reports Page] KPIs response status:', res.status, res.statusText)
        if (res.ok) {
          try {
            const kpisData = await res.json()
            console.log('[Reports Page] KPIs data received:', { ok: kpisData.ok, hasKpis: !!kpisData.kpis })
            if (kpisData.ok && kpisData.kpis) {
              setKpis(kpisData.kpis)
              // Clear any previous errors if data loaded successfully
              setError(null)
            } else {
              const errorMsg = kpisData.error || 'Invalid KPIs response format'
              console.error('[Reports Page] KPIs response error:', errorMsg, kpisData)
              // Only set error if we don't already have data
              if (!kpis) {
                setError(errorMsg)
              }
            }
          } catch (err: any) {
            const errorMsg = `Failed to parse KPIs response: ${err?.message || 'Unknown error'}`
            console.error('[Reports Page] KPIs parse error:', errorMsg, err)
            // Only set error if we don't already have data
            if (!kpis) {
              setError(errorMsg)
            }
          }
        } else {
          // HTTP error (401, 500, etc.)
          try {
            const errorData = await res.json()
            const errorMsg = errorData.error || `HTTP ${res.status}: ${res.statusText}`
            console.error('[Reports Page] KPIs API error:', errorMsg, { status: res.status, errorData })
            // Only set error if we don't already have data
            if (!kpis) {
              setError(errorMsg)
            }
          } catch (parseErr) {
            const errorMsg = `HTTP ${res.status}: ${res.statusText}`
            console.error('[Reports Page] KPIs API error (unparseable):', errorMsg)
            // Only set error if we don't already have data
            if (!kpis) {
              setError(errorMsg)
            }
          }
        }
      }

      // Handle Users response
      if (usersRes.status === 'rejected') {
        console.error('[Reports Page] Users request rejected:', usersRes.reason)
        // Don't set error here - KPIs might have loaded successfully
      } else if (usersRes.status === 'fulfilled') {
        const res = usersRes.value
        console.log('[Reports Page] Users response status:', res.status, res.statusText)
        if (res.ok) {
          try {
            const usersData = await res.json()
            console.log('[Reports Page] Users data received:', { ok: usersData.ok, userCount: usersData.users?.length })
            if (usersData.ok && usersData.users) {
              setUserPerformance(usersData.users)
            } else {
              const errorMsg = usersData.error || 'Invalid users response format'
              console.error('[Reports Page] Users response error:', errorMsg, usersData)
              // Don't set error here - KPIs might have loaded successfully
            }
          } catch (err: any) {
            console.error('[Reports Page] Failed to parse Users response:', err)
            // Don't set error here - KPIs might have loaded successfully
          }
        } else {
          // HTTP error (401, 500, etc.)
          try {
            const errorData = await res.json()
            console.error('[Reports Page] Users API error:', errorData.error || `HTTP ${res.status}: ${res.statusText}`, { status: res.status, errorData })
          } catch (parseErr) {
            console.error('[Reports Page] Users API error (unparseable):', `HTTP ${res.status}: ${res.statusText}`)
          }
        }
      }
    } catch (error: any) {
      const errorMsg = `Failed to load reports: ${error?.message || 'Unknown error'}`
      console.error(errorMsg, error)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
        <div className="space-y-2">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-headline text-slate-900">
            Reports & Analytics
          </h1>
          <p className="text-body text-slate-600 mt-1">
            Industry-specific insights for visa & business setup services
          </p>
        </div>

        {error && (
          <BentoCard className="border-red-200/60">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h3 className="text-body font-bold text-red-700">
                Error Loading Reports
              </h3>
            </div>
            <div>
              <p className="text-caption text-slate-700 mb-3">{error}</p>
              <Button onClick={loadData} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          </BentoCard>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2">
          <TabsList>
            <TabsTrigger value="overview">Overview KPIs</TabsTrigger>
            <TabsTrigger value="users">User Performance</TabsTrigger>
            <TabsTrigger value="services">Service Analytics</TabsTrigger>
            <TabsTrigger value="channels">Channel Performance</TabsTrigger>
          </TabsList>

          {/* Overview KPIs */}
          <TabsContent value="overview" className="space-y-2">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : kpis ? (
              <>
                {/* Key Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <KPICard
                    title="Conversion Rate"
                    value={`${(kpis.conversion?.conversionRate ?? 0).toFixed(1)}%`}
                    icon={<Target className="h-4 w-4" />}
                  />
                  <KPICard
                    title="Avg Processing Time"
                    value={`${(kpis.processing?.avgProcessingTimeDays ?? 0).toFixed(1)} days`}
                    icon={<Timer className="h-4 w-4" />}
                  />
                  <KPICard
                    title="Avg Response Time"
                    value={`${Math.floor((kpis.processing?.avgResponseTimeMinutes ?? 0) / 60)}h ${(kpis.processing?.avgResponseTimeMinutes ?? 0) % 60}m`}
                    icon={<Zap className="h-4 w-4" />}
                  />
                  <KPICard
                    title="Task Completion"
                    value={`${(kpis.tasks?.completionRate ?? 0).toFixed(1)}%`}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                </div>

                {/* Expiry Alerts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <BentoCard 
                    title="Expiring Soon (30 days)" 
                    icon={<AlertTriangle className="h-4 w-4 text-orange-600" />}
                    className="border-orange-200/60"
                    action={
                      <Link href="/leads?filter=expiring_90">
                        <Button variant="ghost" size="sm" className="h-6 text-caption gap-1">
                          View All <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    }
                  >
                    <p className="text-headline font-semibold text-orange-600">{kpis.expiry?.expiringSoon ?? 0}</p>
                    <p className="text-caption text-slate-600 mt-1">
                      Leads with expiries in the next 30 days
                    </p>
                  </BentoCard>

                  <BentoCard 
                    title="Overdue" 
                    icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
                    className="border-red-200/60"
                    action={
                      <Link href="/leads?filter=overdue">
                        <Button variant="ghost" size="sm" className="h-6 text-caption gap-1">
                          View All <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    }
                  >
                    <p className="text-headline font-semibold text-red-600">{kpis.expiry?.overdueLeads ?? 0}</p>
                    <p className="text-caption text-slate-600 mt-1">
                      Leads with expired documents/visas
                    </p>
                  </BentoCard>
                </div>

                {/* Recent Activity */}
                <BentoCard 
                  title="Recent Activity (Last 30 Days)"
                  icon={<Calendar className="h-4 w-4" />}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-caption text-slate-600 mb-1 font-semibold">New Leads</p>
                      <p className="text-headline font-semibold">{kpis.activity.recentLeads30Days}</p>
              </div>
                    <div>
                      <p className="text-caption text-slate-600 mb-1 font-semibold">Won Deals</p>
                      <p className="text-headline font-semibold text-green-600">
                        {kpis.activity.recentWon30Days}
                      </p>
        </div>
              </div>
                </BentoCard>
              </>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No data available"
                description="Reports data will appear here once leads and activities are recorded."
              />
            )}
          </TabsContent>

          {/* User Performance */}
          <TabsContent value="users" className="space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : userPerformance.length > 0 ? (
              <div className="space-y-2">
                {userPerformance.map((user) => (
                  <BentoCard 
                    key={user.userId}
                    title={user.userName}
                    icon={<UserCheck className="h-4 w-4" />}
                    badge={<Badge variant="outline" className="text-caption">{user.metrics.totalLeads} Leads</Badge>}
                  >
                    <p className="text-caption text-slate-600 mb-3">
                      {user.userEmail} • {user.userRole}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <p className="text-caption text-slate-600 mb-1 font-semibold">Conversion Rate</p>
                        <p className="text-subhead font-bold text-slate-900">{user.metrics.conversionRate.toFixed(1)}%</p>
                        <p className="text-caption text-slate-600 mt-0.5">
                          {user.metrics.wonLeads} won
                        </p>
                        </div>
                      <div>
                        <p className="text-caption text-slate-600 mb-1 font-semibold">Response Time</p>
                        <p className="text-subhead font-semibold">
                          {Math.floor(user.metrics.avgResponseTimeMinutes / 60)}h{' '}
                          {user.metrics.avgResponseTimeMinutes % 60}m
                        </p>
                      </div>
                      <div>
                        <p className="text-caption text-slate-600 mb-1 font-semibold">Tasks Completed</p>
                        <p className="text-subhead font-bold text-slate-900">{user.metrics.completedTasks}</p>
                        <p className="text-caption text-slate-600 mt-0.5">
                          {user.metrics.taskCompletionRate.toFixed(1)}% rate
                        </p>
                      </div>
                      <div>
                        <p className="text-caption text-slate-600 mb-1 font-semibold">Messages Sent</p>
                        <p className="text-subhead font-bold text-slate-900">{user.metrics.messagesSent30Days}</p>
                        <p className="text-caption text-slate-600 mt-0.5">last 30 days</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200/60">
                      <div className="flex items-center gap-3 text-caption">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-600" />
                          <span className="text-slate-600">Processing:</span>
                          <span className="font-bold text-slate-900">
                            {user.metrics.avgProcessingTimeDays.toFixed(1)} days
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-slate-600" />
                          <span className="text-slate-600">In Progress:</span>
                          <span className="font-bold text-slate-900">{user.metrics.inProgressLeads}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-slate-600" />
                          <span className="text-slate-600 font-medium">Recent Activity:</span>
                          <span className="font-bold text-slate-900">{user.metrics.recentActivity30Days}</span>
                        </div>
                      </div>
              </div>
                  </BentoCard>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No user performance data available"
                description="User performance metrics will appear here once activities are recorded."
              />
            )}
          </TabsContent>

          {/* Service Analytics */}
          <TabsContent value="services" className="space-y-2">
            {loading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : kpis && kpis.serviceTypes && kpis.serviceTypes.length > 0 ? (
              <BentoCard
                title="Performance by Service Type"
                icon={<BarChart3 className="h-4 w-4" />}
              >
                <p className="text-xs text-slate-600 mb-3 font-medium">
                  Conversion rates and activity by service
                </p>
                <div className="space-y-2">
                  {kpis.serviceTypes.map((service) => (
                    <div
                      key={service.name}
                      className="p-3 rounded-lg border border-slate-200/60 hover:bg-slate-50 transition-colors bg-white"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{service.name}</h3>
                          <p className="text-xs text-slate-600 mt-0.5 font-medium">
                            {service.total} total • {service.won} won • {service.inProgress} in progress
                          </p>
                        </div>
                        <Badge variant={service.conversionRate >= 20 ? 'default' : 'secondary'} className="text-xs font-semibold">
                          {service.conversionRate.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-slate-900 transition-all duration-500"
                          style={{ width: `${service.conversionRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
              </BentoCard>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No service data available"
                description="Service performance metrics will appear here once leads are created."
              />
            )}
          </TabsContent>

          {/* Channel Performance */}
          <TabsContent value="channels" className="space-y-2">
            {loading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : kpis && kpis.channels && kpis.channels.length > 0 ? (
              <BentoCard
                title="Performance by Channel"
                icon={<MessageSquare className="h-4 w-4" />}
              >
                <p className="text-xs text-slate-600 mb-3 font-medium">
                  Which channels drive the best conversions?
                </p>
                <div className="space-y-2">
                  {kpis.channels.map((channel) => (
                    <div
                      key={channel.channel}
                      className="p-3 rounded-lg border border-slate-200/60 hover:bg-slate-50 transition-colors bg-white"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-bold capitalize text-slate-900">{channel.channel}</h3>
                          <p className="text-xs text-slate-600 mt-0.5 font-medium">
                            {channel.total} leads • {channel.won} won
                          </p>
                        </div>
                        <Badge variant={channel.conversionRate >= 20 ? 'default' : 'secondary'} className="text-xs font-semibold">
                          {channel.conversionRate.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-slate-900 transition-all duration-500"
                          style={{ width: `${channel.conversionRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
              </BentoCard>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="No channel data available"
                description="Channel performance metrics will appear here once leads are created."
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}
