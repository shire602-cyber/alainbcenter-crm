import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/reports/users
 * Returns per-user performance metrics
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuthApi()

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Get all users
    const users = await prisma.user.findMany({
      include: {
        assignedLeads: {
          select: {
            id: true,
            contactId: true,
            stage: true,
            pipelineStage: true,
            leadType: true,
            serviceTypeId: true,
            priority: true,
            aiScore: true,
            nextFollowUpAt: true,
            lastContactAt: true,
            expiryDate: true,
            createdAt: true,
            updatedAt: true,
            // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
          },
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
            tasks: {
              select: {
                id: true,
                title: true,
                status: true,
                dueAt: true,
                createdAt: true,
              },
            },
            conversations: {
              include: {
                messages: {
                  where: {
                    OR: [
                      { direction: 'OUTBOUND' },
                      { direction: 'OUT' },
                      { direction: 'outbound' },
                    ],
                    createdAt: { gte: thirtyDaysAgo },
                  },
                  select: {
                    id: true,
                    direction: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
        assignedTasks: {
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            createdAt: true,
          },
        },
        createdTasks: {
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            createdAt: true,
          },
        },
      },
    }).catch((err) => {
      console.error('Error fetching users in reports route:', err)
      return []
    })

    const userPerformance = users.map((user) => {
      const assignedLeads = user.assignedLeads
      const totalLeads = assignedLeads.length
      const wonLeads = assignedLeads.filter((l) => l.stage === 'COMPLETED_WON').length
      const inProgressLeads = assignedLeads.filter((l) => l.stage === 'IN_PROGRESS').length
      const newLeads = assignedLeads.filter((l) => l.stage === 'NEW').length

      // Conversion rate
      const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0

      // Response time (average time to first contact)
      const contactedLeads = assignedLeads.filter((l) => l.lastContactAt && l.createdAt)
      const responseTimes = contactedLeads.map((lead) => {
        const createdAt = new Date(lead.createdAt)
        const firstContact = new Date(lead.lastContactAt!)
        return Math.floor((firstContact.getTime() - createdAt.getTime()) / (1000 * 60)) // minutes
      })
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0

      // Tasks
      const totalTasks = user.assignedTasks.length
      const completedTasks = user.assignedTasks.filter((t) => t.status === 'DONE').length
      const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

      // Messages sent (last 30 days)
      const messagesSent = assignedLeads.reduce(
        (sum, lead) => sum + lead.conversations.reduce((s, conv) => s + conv.messages.length, 0),
        0
      )

      // Recent activity (leads created/updated in last 30 days)
      const recentActivity = assignedLeads.filter(
        (l) =>
          new Date(l.createdAt) >= thirtyDaysAgo || new Date(l.updatedAt) >= thirtyDaysAgo
      ).length

      // Processing time (average days from NEW to COMPLETED_WON)
      const completedLeads = assignedLeads.filter(
        (l) => l.stage === 'COMPLETED_WON' && l.createdAt
      )
      const processingTimes = completedLeads.map((lead) => {
        const createdAt = new Date(lead.createdAt)
        const updatedAt = new Date(lead.updatedAt)
        return Math.floor((updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) // days
      })
      const avgProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0

      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        metrics: {
          totalLeads,
          wonLeads,
          inProgressLeads,
          newLeads,
          conversionRate: Number(conversionRate.toFixed(2)),
          avgResponseTimeMinutes: Number(avgResponseTime.toFixed(0)),
          totalTasks,
          completedTasks,
          taskCompletionRate: Number(taskCompletionRate.toFixed(2)),
          messagesSent30Days: messagesSent,
          recentActivity30Days: recentActivity,
          avgProcessingTimeDays: Number(avgProcessingTime.toFixed(1)),
        },
      }
    })

    // Sort by total leads (descending)
    userPerformance.sort((a, b) => b.metrics.totalLeads - a.metrics.totalLeads)

    return NextResponse.json({
      ok: true,
      users: userPerformance,
    })
  } catch (error: any) {
    console.error('GET /api/reports/users error:', error)
    const statusCode = error?.statusCode || 500
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load user performance' },
      { status: statusCode }
    )
  }
}


