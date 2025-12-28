/**
 * DO THIS NOW API
 * Returns top 5 actionable items in priority order:
 * - Tasks due today or overdue (Reply, Quote, Call)
 * - Conversations needing reply
 * - Leads qualified-ready-for-quote
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    const now = new Date()
    const today = new Date(now)
    today.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(today)
    todayEnd.setUTCHours(23, 59, 59, 999)

    const items: Array<{
      id: string
      leadId: number
      contactName: string
      title: string
      reason: string
      priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
      action: {
        type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
        label: string
        url: string
      }
      dueAt?: string
      revenuePotential?: number
    }> = []

    // 1. Tasks due today or overdue
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { assignedUserId: user.id },
          { assignedUserId: null },
        ],
        status: 'OPEN',
        dueAt: {
          lte: todayEnd,
        },
        type: {
          in: ['REPLY_WHATSAPP', 'DOCUMENT_REQUEST', 'CALL', 'FOLLOW_UP'],
        },
      },
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    })

    for (const task of tasks) {
      const isOverdue = task.dueAt && task.dueAt < now
      const hoursOverdue = task.dueAt && isOverdue
        ? Math.floor((now.getTime() - task.dueAt.getTime()) / (1000 * 60 * 60))
        : 0

      let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
      let actionType: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up' = 'view'
      let actionLabel = 'View'

      if (task.type === 'REPLY_WHATSAPP') {
        actionType = 'reply'
        actionLabel = 'Reply Now'
        priority = isOverdue && hoursOverdue > 24 ? 'URGENT' : isOverdue ? 'HIGH' : 'NORMAL'
      } else if (task.type === 'CALL') {
        actionType = 'call'
        actionLabel = 'Call Now'
        priority = isOverdue ? 'HIGH' : 'NORMAL'
      } else if (task.type === 'DOCUMENT_REQUEST' && task.title.toLowerCase().includes('quotation')) {
        actionType = 'send_quote'
        actionLabel = 'Send Quote'
        priority = isOverdue ? 'HIGH' : 'NORMAL'
      } else if (task.type === 'FOLLOW_UP') {
        actionType = 'follow_up'
        actionLabel = 'Follow Up'
        priority = isOverdue ? 'HIGH' : 'NORMAL'
      }

      items.push({
        id: `task_${task.id}`,
        leadId: task.leadId,
        contactName: task.lead.contact.fullName,
        title: task.title,
        reason: isOverdue
          ? `Overdue by ${hoursOverdue}h (due ${task.dueAt?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`
          : `Due ${task.dueAt?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
        priority,
        action: {
          type: actionType,
          label: actionLabel,
          url: `/leads/${task.leadId}?action=${actionType}`,
        },
        dueAt: task.dueAt?.toISOString(),
        revenuePotential: task.lead.expectedRevenueAED || undefined,
      })
    }

    // 2. Conversations needing reply (SLA breach or needs reply)
    const conversations = await prisma.conversation.findMany({
      where: {
        status: 'open',
        lastInboundAt: {
          not: null,
        },
        OR: [
          { assignedUserId: user.id },
          { assignedUserId: null },
        ],
      },
      include: {
        contact: true,
        lead: {
          include: {
            contact: true,
          },
        },
      },
      take: 10,
    })

    for (const conv of conversations) {
      if (!conv.lastInboundAt) continue

      const needsReply = !conv.lastOutboundAt || conv.lastOutboundAt < conv.lastInboundAt
      if (!needsReply) continue

      const minutesSince = Math.floor((now.getTime() - conv.lastInboundAt.getTime()) / (1000 * 60))
      const hoursSince = Math.floor(minutesSince / 60)

      let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
      if (hoursSince > 24) priority = 'URGENT'
      else if (hoursSince > 10) priority = 'HIGH'
      else if (hoursSince > 4) priority = 'NORMAL'
      else priority = 'LOW'

      items.push({
        id: `conv_${conv.id}`,
        leadId: conv.leadId || 0,
        contactName: conv.contact.fullName,
        title: `Reply to ${conv.contact.fullName}`,
        reason: `SLA: ${hoursSince}h since last message`,
        priority,
        action: {
          type: 'reply',
          label: 'Reply Now',
          url: `/leads/${conv.leadId || 0}?action=reply`,
        },
        revenuePotential: conv.lead?.expectedRevenueAED || undefined,
      })
    }

    // 3. Leads qualified-ready-for-quote
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
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })

    for (const lead of qualifiedLeads) {
      items.push({
        id: `quote_${lead.id}`,
        leadId: lead.id,
        contactName: lead.contact.fullName,
        title: `Send quotation to ${lead.contact.fullName}`,
        reason: 'Qualified - ready for quote',
        priority: 'HIGH',
        action: {
          type: 'send_quote',
          label: 'Send Quote',
          url: `/leads/${lead.id}?action=quote`,
        },
        revenuePotential: lead.expectedRevenueAED || undefined,
      })
    }

    // Sort by priority and take top 5
    const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }
    items.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      return (b.revenuePotential || 0) - (a.revenuePotential || 0)
    })

    return NextResponse.json({
      items: items.slice(0, 5),
      count: items.length,
    })
  } catch (error: any) {
    console.error('GET /api/dashboard/do-this-now error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch actionable items' },
      { status: 500 }
    )
  }
}

