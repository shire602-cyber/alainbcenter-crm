/**
 * COMMAND CENTER API
 * 
 * Returns grouped actionable items:
 * - URGENT: Must handle today (SLA breach, expiring within 7 days)
 * - REVENUE_NOW: Ready for quote, follow-up due, hot leads
 * - OPERATIONS: Docs missing, application steps pending
 * - QUIET_WINS: Completed today + positive counters
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getCommandCenter } from '@/lib/myDay/commandCenter'
import { prisma } from '@/lib/prisma'
import { format, differenceInDays, isToday, parseISO } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    const now = new Date()
    const today = new Date(now)
    today.setUTCHours(0, 0, 0, 0)

    // Get command center data
    const commandCenter = await getCommandCenter(user.id)

    // Group items into sections
    const urgent: any[] = []
    const revenueNow: any[] = []
    const operations: any[] = []
    const quietWins: any[] = []

    // URGENT: SLA breaches, expiring within 7 days, overdue tasks
    for (const item of commandCenter.actionRequired) {
      if (item.priority === 'URGENT' || item.priority === 'HIGH') {
        urgent.push({
          ...item,
          dueDate: item.dueAt ? format(item.dueAt, 'MMM dd, yyyy') : undefined,
          owner: undefined, // TODO: Add assigned user name if available
        })
      }
    }

    // REVENUE_NOW: Quotes ready, qualified leads, follow-ups due
    for (const item of commandCenter.quickWins) {
      if (item.action.type === 'send_quote' || item.action.type === 'follow_up') {
        revenueNow.push({
          ...item,
          dueDate: item.dueAt ? format(item.dueAt, 'MMM dd, yyyy') : undefined,
          owner: undefined,
        })
      }
    }

    // Also add qualified leads ready for quote
    const qualifiedLeads = await prisma.lead.findMany({
      where: {
        stage: {
          in: ['QUALIFIED', 'ENGAGED'],
        },
        quotationSentAt: null,
        OR: [
          { assignedUserId: user.id },
          { assignedUserId: null },
        ],
      },
      include: {
        contact: true,
        serviceType: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })

    for (const lead of qualifiedLeads) {
      revenueNow.push({
        id: `quote_${lead.id}`,
        leadId: lead.id,
        contactName: lead.contact.fullName,
        serviceType: lead.serviceType?.name,
        title: `Send quotation to ${lead.contact.fullName}`,
        reason: 'Qualified - ready for quote',
        priority: 'HIGH' as const,
        action: {
          type: 'send_quote' as const,
          label: 'Send Quote',
          url: `/leads/${lead.id}?action=quote`,
        },
        revenuePotential: lead.expectedRevenueAED || undefined,
        dueDate: undefined,
        owner: undefined,
      })
    }

    // OPERATIONS: Expiring items within 30 days (not urgent yet)
    const expiringLeads = await prisma.lead.findMany({
      where: {
        expiryItems: {
          some: {
            expiryDate: {
              gte: today,
              lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // Next 30 days
            },
            renewalStatus: 'PENDING',
          },
        },
      },
      include: {
        contact: true,
        serviceType: true,
        expiryItems: {
          where: {
            expiryDate: {
              gte: today,
              lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
            renewalStatus: 'PENDING',
          },
          orderBy: { expiryDate: 'asc' },
          take: 1,
        },
      },
      take: 10,
    })

    for (const lead of expiringLeads) {
      const nearestExpiry = lead.expiryItems[0]
      if (!nearestExpiry) continue

      const expiryDate = nearestExpiry.expiryDate instanceof Date 
        ? nearestExpiry.expiryDate 
        : new Date(nearestExpiry.expiryDate)
      const daysUntil = differenceInDays(expiryDate, today)
      
      // Skip if urgent (already in URGENT section)
      if (daysUntil <= 7) continue

      operations.push({
        id: `expiry_${lead.id}_${nearestExpiry.id}`,
        leadId: lead.id,
        contactName: lead.contact.fullName,
        serviceType: lead.serviceType?.name,
        title: `${nearestExpiry.type} expires in ${daysUntil} days`,
        reason: `Expires ${format(expiryDate, 'MMM dd, yyyy')}`,
        priority: daysUntil <= 14 ? 'HIGH' : 'NORMAL' as const,
        action: {
          type: 'view' as const,
          label: 'View Lead',
          url: `/leads/${lead.id}`,
        },
        dueDate: format(expiryDate, 'MMM dd, yyyy'),
        owner: undefined,
      })
    }

    // QUIET WINS: Completed today
    const todayStart = new Date(today)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(today)
    todayEnd.setUTCHours(23, 59, 59, 999)

    const completedTasks = await prisma.task.count({
      where: {
        assignedUserId: user.id,
        doneAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    const sentMessages = await prisma.message.count({
      where: {
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    if (completedTasks > 0 || sentMessages > 0) {
      quietWins.push({
        id: 'wins_today',
        type: 'summary',
        tasksCompleted: completedTasks,
        messagesSent: sentMessages,
      })
    }

    // Limit each section to max 5 items
    const limitedUrgent = urgent.slice(0, 5)
    const limitedRevenueNow = revenueNow.slice(0, 5)
    const limitedOperations = operations.slice(0, 5)

    return NextResponse.json({
      urgent: limitedUrgent,
      revenueNow: limitedRevenueNow,
      operations: limitedOperations,
      quietWins,
      counts: {
        urgent: urgent.length,
        revenueNow: revenueNow.length,
        operations: operations.length,
      },
    })
  } catch (error: any) {
    console.error('GET /api/dashboard/command-center error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch command center data' },
      { status: 500 }
    )
  }
}


