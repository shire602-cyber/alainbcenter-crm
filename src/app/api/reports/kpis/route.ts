import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/reports/kpis
 * Returns industry-specific KPIs for visa/business setup services
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuthApi()

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Optimized: Fetch only needed fields and use database-level aggregations where possible
    const [
      allLeads,
      allTasks,
      leadCounts,
      recentLeadCount,
      recentWonCount,
    ] = await Promise.all([
      // Fetch leads with optimized selects
      prisma.lead.findMany({
        select: {
          id: true,
          stage: true,
          leadType: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
          lastContactAt: true,
          lastContactChannel: true,
          serviceType: {
            select: {
              name: true,
            },
          },
          expiryItems: {
            select: {
              expiryDate: true,
            },
          },
        },
      }).catch((err) => {
        console.error('Error fetching leads in KPIs route:', err)
        return []
      }),
      // Fetch tasks count and status
      prisma.task.findMany({
        select: {
          id: true,
          status: true,
        },
      }).catch((err) => {
        console.error('Error fetching tasks in KPIs route:', err)
        return []
      }),
      // Get counts using database aggregation (more efficient)
      prisma.lead.groupBy({
        by: ['stage'],
        _count: {
          id: true,
        },
      }).catch(() => []),
      // Recent leads count (database-level filter)
      prisma.lead.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }).catch(() => 0),
      // Recent won count (database-level filter)
      prisma.lead.count({
        where: {
          stage: 'COMPLETED_WON',
          updatedAt: {
            gte: thirtyDaysAgo,
          },
        },
      }).catch(() => 0),
    ])

    // Conversion metrics (use database aggregation results where available)
    const totalLeads = allLeads.length
    const stageCounts = new Map(leadCounts.map((g) => [g.stage, g._count.id]))
    const wonLeads = stageCounts.get('COMPLETED_WON') || 0
    const lostLeads = stageCounts.get('LOST') || 0
    const inProgressLeads = stageCounts.get('IN_PROGRESS') || 0
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0

    // Service type distribution
    const serviceTypeStats = new Map<string, { count: number; won: number; inProgress: number }>()
    allLeads.forEach((lead) => {
      const serviceName = lead.serviceType?.name || lead.leadType || 'General'
      const current = serviceTypeStats.get(serviceName) || { count: 0, won: 0, inProgress: 0 }
      current.count++
      if (lead.stage === 'COMPLETED_WON') current.won++
      if (lead.stage === 'IN_PROGRESS') current.inProgress++
      serviceTypeStats.set(serviceName, current)
    })

    // Processing time metrics (time from NEW to COMPLETED_WON)
    const completedLeads = allLeads.filter((l) => l.stage === 'COMPLETED_WON' && l.createdAt)
    const processingTimes = completedLeads.map((lead) => {
      const createdAt = new Date(lead.createdAt)
      const updatedAt = new Date(lead.updatedAt)
      return Math.floor((updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) // days
    })
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0

    // Expiry tracking - check both legacy expiryDate and expiryItems
    const expiringSoon = allLeads.filter((lead) => {
      // Check legacy expiryDate
      if (lead.expiryDate) {
        const expiry = new Date(lead.expiryDate)
        const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) return true
      }
      // Check expiryItems
      if (lead.expiryItems && lead.expiryItems.length > 0) {
        return lead.expiryItems.some((item: any) => {
          const expiry = new Date(item.expiryDate)
          const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return daysUntilExpiry >= 0 && daysUntilExpiry <= 30
        })
      }
      return false
    }).length

    const overdueLeads = allLeads.filter((lead) => {
      // Check legacy expiryDate
      if (lead.expiryDate) {
        const expiry = new Date(lead.expiryDate)
        if (expiry.getTime() < now.getTime()) return true
      }
      // Check expiryItems
      if (lead.expiryItems && lead.expiryItems.length > 0) {
        return lead.expiryItems.some((item: any) => {
          const expiry = new Date(item.expiryDate)
          return expiry.getTime() < now.getTime()
        })
      }
      return false
    }).length

    // Response time (time from lead creation to first contact)
    const contactedLeads = allLeads.filter((l) => l.lastContactAt && l.createdAt)
    const responseTimes = contactedLeads.map((lead) => {
      const createdAt = new Date(lead.createdAt)
      const firstContact = new Date(lead.lastContactAt!)
      return Math.floor((firstContact.getTime() - createdAt.getTime()) / (1000 * 60)) // minutes
    })
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0

    // Task completion rate (already fetched in parallel above)
    const completedTasks = allTasks.filter((t) => t.status === 'DONE').length
    const taskCompletionRate = allTasks.length > 0 ? (completedTasks / allTasks.length) * 100 : 0

    // Channel performance
    const channelStats = new Map<string, { count: number; won: number }>()
    allLeads.forEach((lead) => {
      const channel = lead.lastContactChannel || 'unknown'
      const current = channelStats.get(channel) || { count: 0, won: 0 }
      current.count++
      if (lead.stage === 'COMPLETED_WON') current.won++
      channelStats.set(channel, current)
    })

    return NextResponse.json({
      ok: true,
      kpis: {
        conversion: {
          totalLeads,
          wonLeads,
          lostLeads,
          inProgressLeads,
          conversionRate: Number(conversionRate.toFixed(2)),
        },
        processing: {
          avgProcessingTimeDays: Number(avgProcessingTime.toFixed(1)),
          avgResponseTimeMinutes: Number(avgResponseTime.toFixed(0)),
        },
        expiry: {
          expiringSoon,
          overdueLeads,
        },
        activity: {
          recentLeads30Days: recentLeadCount,
          recentWon30Days: recentWonCount,
        },
        tasks: {
          total: allTasks.length,
          completed: completedTasks,
          completionRate: Number(taskCompletionRate.toFixed(2)),
        },
        serviceTypes: Array.from(serviceTypeStats.entries()).map(([name, stats]) => ({
          name,
          total: stats.count,
          won: stats.won,
          inProgress: stats.inProgress,
          conversionRate: stats.count > 0 ? Number(((stats.won / stats.count) * 100).toFixed(2)) : 0,
        })),
        channels: Array.from(channelStats.entries()).map(([channel, stats]) => ({
          channel,
          total: stats.count,
          won: stats.won,
          conversionRate: stats.count > 0 ? Number(((stats.won / stats.count) * 100).toFixed(2)) : 0,
        })),
      },
    })
  } catch (error: any) {
    console.error('GET /api/reports/kpis error:', error)
    const statusCode = error?.statusCode || 500
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load KPIs' },
      { status: statusCode }
    )
  }
}


