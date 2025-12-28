import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  TrendingUp, 
  Users, 
  Clock, 
  AlertCircle, 
  Calendar, 
  CheckCircle2, 
  MessageSquare,
  Phone,
  Flame,
  Snowflake,
  RefreshCw,
  ArrowRight,
  Target,
  DollarSign,
  Zap,
  Mail,
} from 'lucide-react'
import { format, differenceInDays, parseISO, subDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { KPICard } from '@/components/dashboard/KPICard'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { TopPrioritiesToday } from '@/components/dashboard/TopPrioritiesToday'
import { BlockedByCustomer } from '@/components/dashboard/BlockedByCustomer'
import { TodaysImpact } from '@/components/dashboard/TodaysImpact'
import { EndOfDaySummary } from '@/components/dashboard/EndOfDaySummary'
import { ForecastRevenueWidget } from '@/components/dashboard/ForecastRevenueWidget'
import { PipelineForecastWidget } from '@/components/dashboard/PipelineForecastWidget'
import { AtRiskLeadsWidget } from '@/components/dashboard/AtRiskLeadsWidget'

const STAGES = [
  { value: 'NEW', label: 'New', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'ENGAGED', label: 'Engaged', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'PROPOSAL_SENT', label: 'Proposal', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  { value: 'COMPLETED_WON', label: 'Won', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'LOST', label: 'Lost', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
]

// Generate simple sparkline data
function generateSparkline(count: number, baseValue: number): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const variance = Math.random() * 0.3 - 0.15 // ±15% variance
    return Math.max(0, baseValue * (1 + variance))
  })
}

// Calculate trend (simplified - compares current with previous period)
function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

export default async function DashboardPage() {
  try {
    const user = await requireAuth()
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    
    const sevenDaysAgo = subDays(today, 7)
    const fourteenDaysAgo = subDays(today, 14)
    const fourteenDaysFromNow = new Date(today)
    fourteenDaysFromNow.setUTCDate(fourteenDaysFromNow.getUTCDate() + 14)
    
    const ninetyDaysFromNow = new Date(today)
    ninetyDaysFromNow.setUTCDate(ninetyDaysFromNow.getUTCDate() + 90)
    
    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(0, 0, 0, 0)

    const todayEnd = new Date(today)
    todayEnd.setUTCHours(23, 59, 59, 999)

    // Fetch all data in parallel
    const [
      totalLeads,
      leadsLast7Days,
      leadsPrevious7Days,
      pipelineCounts,
      myAssignedLeads,
      followUpsToday,
      urgentExpiries,
      expiringLeads90Days,
      todaysTasks,
      overdueTasks,
      hotLeadsCount,
      warmLeadsCount,
    ] = await Promise.allSettled([
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.lead.count({ where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
      prisma.lead.groupBy({
        by: ['stage'],
        _count: { stage: true },
      }),
      prisma.lead.findMany({
        where: { 
          assignedUserId: user.id,
          OR: [
            { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
            { nextFollowUpAt: { not: null } },
            { expiryItems: { some: {} } },
          ],
        },
        select: {
          id: true,
          contact: { select: { id: true, fullName: true, phone: true } },
          expiryItems: { take: 3, select: { id: true, type: true, expiryDate: true } },
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      prisma.lead.findMany({
        where: {
          assignedUserId: user.id,
          nextFollowUpAt: { gte: today, lt: tomorrow },
          OR: [
            { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
            { pipelineStage: { notIn: ['completed', 'won', 'lost'] } },
          ],
        },
        select: {
          id: true,
          contact: { select: { id: true, fullName: true, phone: true } },
          serviceType: { select: { id: true, name: true } },
          nextFollowUpAt: true,
          stage: true,
        },
        orderBy: { nextFollowUpAt: 'asc' },
        take: 10,
      }),
      prisma.lead.findMany({
        where: {
          assignedUserId: user.id,
          expiryItems: {
            some: {
              expiryDate: { gte: today, lte: fourteenDaysFromNow },
            },
          },
          OR: [
            { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
            { pipelineStage: { notIn: ['completed', 'won', 'lost'] } },
          ],
        },
        select: {
          id: true,
          contact: { select: { id: true, fullName: true, phone: true } },
          expiryItems: {
            where: {
              expiryDate: { gte: today, lte: fourteenDaysFromNow },
            },
            orderBy: { expiryDate: 'asc' },
            take: 1,
            select: { id: true, type: true, expiryDate: true },
          },
        },
        take: 10,
      }),
      prisma.lead.findMany({
        where: {
          expiryItems: {
            some: {
              expiryDate: { gte: today, lte: ninetyDaysFromNow },
            },
          },
          OR: [
            { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
            { pipelineStage: { notIn: ['completed', 'won', 'lost'] } },
          ],
        },
        select: {
          id: true,
          contact: { select: { id: true, fullName: true, phone: true } },
          expiryItems: {
            where: {
              expiryDate: { gte: today, lte: ninetyDaysFromNow },
            },
            orderBy: { expiryDate: 'asc' },
            take: 1,
          },
          serviceType: { select: { id: true, name: true } },
          estimatedRenewalValue: true,
          renewalProbability: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.task.findMany({
        where: {
          assignedUserId: user.id,
          dueAt: { gte: today, lte: todayEnd },
          doneAt: null,
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          lead: {
            select: {
              id: true,
              contact: { select: { fullName: true } },
              serviceType: { select: { name: true } },
            },
          },
        },
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
      prisma.task.findMany({
        where: {
          assignedUserId: user.id,
          dueAt: { lt: today },
          doneAt: null,
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          lead: {
            select: {
              id: true,
              contact: { select: { fullName: true } },
              serviceType: { select: { name: true } },
            },
          },
        },
        orderBy: { dueAt: 'asc' },
        take: 5,
      }),
      prisma.lead.count({ where: { aiScore: { gte: 70 } } }),
      prisma.lead.count({ where: { aiScore: { gte: 40, lt: 70 } } }),
    ])

    const totalLeadsCount = totalLeads.status === 'fulfilled' ? totalLeads.value : 0
    const leadsLast7DaysCount = leadsLast7Days.status === 'fulfilled' ? leadsLast7Days.value : 0
    const leadsPrevious7DaysCount = leadsPrevious7Days.status === 'fulfilled' ? leadsPrevious7Days.value : 0
    const pipelineData = pipelineCounts.status === 'fulfilled' ? pipelineCounts.value : []
    const myLeadsData = myAssignedLeads.status === 'fulfilled' ? myAssignedLeads.value : []
    const followUpsData = followUpsToday.status === 'fulfilled' ? followUpsToday.value : []
    const urgentExpiriesData = urgentExpiries.status === 'fulfilled' ? urgentExpiries.value : []
    const expiringLeadsData = expiringLeads90Days.status === 'fulfilled' ? expiringLeads90Days.value : []
    const tasksData = todaysTasks.status === 'fulfilled' ? todaysTasks.value : []
    const overdueTasksData = overdueTasks.status === 'fulfilled' ? overdueTasks.value : []
    
    const hotLeads = hotLeadsCount.status === 'fulfilled' ? hotLeadsCount.value : 0
    const warmLeads = warmLeadsCount.status === 'fulfilled' ? warmLeadsCount.value : 0

    // Calculate trends
    const newLeadsTrend = calculateTrend(leadsLast7DaysCount, leadsPrevious7DaysCount)

    // Calculate projected renewal revenue
    const projectedRenewalRevenue = expiringLeadsData.reduce((sum: number, lead: any) => {
      const value = parseFloat(lead.estimatedRenewalValue || '0')
      const probability = (lead.renewalProbability || 0) / 100
      return sum + (value * probability)
    }, 0)

    // Build pipeline snapshot
    const pipelineMap = new Map<string, number>()
    pipelineData.forEach((item: any) => {
      pipelineMap.set(item.stage, item._count.stage)
    })

    function formatDate(date: Date | string | null) {
      if (!date) return '—'
      const dateObj = date instanceof Date ? date : parseISO(date.toString())
      return format(dateObj, 'MMM d')
    }

    function formatDaysRemaining(expiryDate: string | Date | null) {
      if (!expiryDate) return '—'
      const dateObj = expiryDate instanceof Date ? expiryDate : parseISO(expiryDate.toString())
      const days = differenceInDays(dateObj, today)
      if (days < 0) return `${Math.abs(days)}d overdue`
      if (days === 0) return 'Today'
      return `${days}d`
    }

    // Combine "My Day" items
    const myDayItems = [
      ...followUpsData.map((lead: any) => ({
        type: 'followup' as const,
        lead,
        priority: 1,
        title: lead.contact?.fullName || 'Unknown',
        subtitle: lead.serviceType?.name || lead.leadType || 'No service',
        action: 'Follow-up due',
        date: lead.nextFollowUpAt,
      })),
      ...urgentExpiriesData.map((lead: any) => ({
        type: 'expiry' as const,
        lead,
        priority: 2,
        title: lead.contact?.fullName || 'Unknown',
        subtitle: lead.expiryItems?.[0]?.type?.replace(/_/g, ' ') || 'Expiry',
        action: 'Expiry urgent',
        date: lead.expiryItems?.[0]?.expiryDate,
      })),
      ...overdueTasksData.map((task: any) => ({
        type: 'task' as const,
        lead: task.lead,
        task,
        priority: 3,
        title: task.title || 'Untitled Task',
        subtitle: task.lead?.contact?.fullName || 'No lead',
        action: 'Task overdue',
        date: task.dueAt,
      })),
    ].filter((item) => item.lead != null).sort((a, b) => a.priority - b.priority).slice(0, 8)

    return (
      <MainLayout>
        <div className="space-y-2">
          {/* Compact Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Welcome back, {user?.name || 'User'}</p>
            </div>
          </div>

          {/* KPI Cards - 8px grid spacing */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <KPICard
              title="Total Leads"
              value={totalLeadsCount}
              icon={<Users className="h-4 w-4" />}
              sparkline={generateSparkline(7, totalLeadsCount / 7)}
              href="/leads"
            />
            <KPICard
              title="New (7d)"
              value={leadsLast7DaysCount}
              trend={{ value: newLeadsTrend, period: 'vs previous 7d' }}
              icon={<TrendingUp className="h-4 w-4" />}
              sparkline={generateSparkline(7, leadsLast7DaysCount / 7)}
            />
            <KPICard
              title="Follow-ups Today"
              value={followUpsData.length}
              icon={<Clock className="h-4 w-4" />}
              href="/leads?filter=followup"
            />
            <KPICard
              title="Renewals (90d)"
              value={expiringLeadsData.length}
              icon={<RefreshCw className="h-4 w-4" />}
              href="/renewals"
            />
          </div>

          {/* Main Grid - Bento Box Layout */}
          <div className="grid gap-2 md:grid-cols-3">
            {/* TOP PRIORITIES TODAY - 2 columns */}
            <BentoCard 
              title="Top Priorities Today" 
              colSpan={2}
              action={<Badge variant="secondary" className="text-xs">Mission Control</Badge>}
            >
              <TopPrioritiesToday />
            </BentoCard>

            {/* Renewals - 1 column */}
            <BentoCard 
              title="Renewals"
              action={
                <Link href="/renewals" className="text-xs text-slate-600 dark:text-slate-400 hover:text-primary transition-colors">
                  View all →
                    </Link>
              }
            >
                  {expiringLeadsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="h-6 w-6 text-blue-600 mb-1.5" />
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 mb-0.5">No renewals</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">All clear!</p>
                    </div>
                  ) : (
                <div className="space-y-1">
                  {expiringLeadsData.slice(0, 5).map((lead: any) => {
                        const expiry = lead.expiryItems?.[0]
                        if (!expiry) return null
                        const expiryDateObj = expiry.expiryDate instanceof Date ? expiry.expiryDate : (expiry.expiryDate ? parseISO(expiry.expiryDate.toString()) : null)
                        const daysRemaining = expiryDateObj ? differenceInDays(expiryDateObj, today) : 999
                        const isUrgent = daysRemaining <= 7
                        return (
                          <Link
                            key={lead.id}
                            href={`/leads/${lead.id}`}
                        className="block p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate flex-1">
                              {lead.contact?.fullName || 'Unknown'}
                              </p>
                              <Badge 
                                variant={isUrgent ? 'destructive' : 'outline'} 
                                className="text-xs flex-shrink-0"
                              >
                            {formatDaysRemaining(expiry.expiryDate instanceof Date ? expiry.expiryDate : expiry.expiryDate.toString())}
                              </Badge>
                            </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {expiry.type?.replace(/_/g, ' ') || 'Expiry'}
                            </p>
                            {lead.estimatedRenewalValue && (
                          <div className="flex items-center gap-1 mt-1">
                                <DollarSign className="h-3 w-3 text-green-600" />
                                <span className="text-xs font-medium text-green-600">
                                  AED {parseFloat(lead.estimatedRenewalValue).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
            </BentoCard>

            {/* Pipeline - 2 columns */}
            <BentoCard 
              title="Pipeline" 
              colSpan={2}
              action={
                <Link href="/leads" className="text-xs text-slate-600 dark:text-slate-400 hover:text-primary transition-colors">
                  View all →
                </Link>
              }
            >
              <div className="grid grid-cols-4 gap-2">
                {STAGES.filter(s => s.value !== 'LOST').map((stage) => {
                  const count = pipelineMap.get(stage.value) || 0
                  const percentage = totalLeadsCount > 0 ? (count / totalLeadsCount) * 100 : 0
                  return (
                    <Link
                      key={stage.value}
                      href={`/leads?stage=${stage.value}`}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{stage.label}</span>
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                          {count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all duration-300", stage.color)}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </BentoCard>

            {/* Lead Quality - 1 column */}
            <BentoCard title="Lead Quality">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                    <div className="flex items-center gap-2">
                    <Flame className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">HOT</span>
                  </div>
                  <Badge variant="destructive" className="text-xs font-semibold">{hotLeads}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20">
                    <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-orange-600" />
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">WARM</span>
                  </div>
                  <Badge className="bg-orange-500 text-white text-xs font-semibold">{warmLeads}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                    <Snowflake className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">COLD</span>
                    </div>
                  <Badge variant="secondary" className="text-xs font-semibold">
                      {Math.max(0, totalLeadsCount - hotLeads - warmLeads)}
                    </Badge>
                  </div>
            </div>
            </BentoCard>
          </div>

          {/* Mission Control Row - Blocked & Impact */}
          <div className="grid gap-2 md:grid-cols-2">
            <BentoCard 
              title="Blocked by Customer"
              action={<Badge variant="outline" className="text-xs">Waiting</Badge>}
            >
              <BlockedByCustomer />
            </BentoCard>
            
            <BentoCard 
              title="Today's Impact"
              action={<Badge variant="secondary" className="text-xs">Achievements</Badge>}
            >
              <TodaysImpact />
            </BentoCard>
          </div>

          {/* Forecast Widgets Row */}
          <div className="grid gap-2 md:grid-cols-3">
            <ForecastRevenueWidget />
            <PipelineForecastWidget />
            <AtRiskLeadsWidget />
          </div>

          {/* End-of-Day Summary */}
          <div className="mt-4">
            <EndOfDaySummary />
          </div>
        </div>
        <QuickActions />
      </MainLayout>
    )
  } catch (error: any) {
    // NEXT_REDIRECT is not a real error - it's how Next.js handles redirects
    // Re-throw it so Next.js can handle the redirect properly
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    
    // Only log actual errors, not redirects
    console.error('Dashboard page error:', error)
    return (
      <MainLayout>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">Error loading dashboard</h2>
          <p className="text-xs text-red-700 dark:text-red-300">
              {error?.message || 'Unknown error occurred'}
            </p>
        </div>
      </MainLayout>
    )
  }
}
