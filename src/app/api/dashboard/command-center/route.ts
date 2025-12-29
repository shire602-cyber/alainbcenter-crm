import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { getAllSignals } from '@/lib/dashboard/signals'
import { startOfDay, endOfDay, addDays, differenceInDays } from 'date-fns'
import type { CommandItem, CommandCenterData } from '@/lib/dashboard/commandCenterTypes'

/**
 * GET /api/dashboard/command-center
 * 
 * Single endpoint for Personal Command Center dashboard
 * Returns: focusNow, upNext, signals, momentum, completedToday
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const sevenDaysFromNow = addDays(now, 7)
    const twoDaysAgo = addDays(now, -2)

    // 1. Get signals (reuse existing logic)
    const signals = await getAllSignals()

    // 2. Get momentum metrics
    const [repliesToday, quotesToday, renewals7d] = await Promise.all([
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          type: { in: ['QUOTE', 'PROPOSAL'] },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.lead.count({
        where: {
          expiryDate: { gte: now, lte: sevenDaysFromNow },
          stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        },
      }),
    ])

    const qualifiedLeads = await prisma.lead.count({
      where: {
        stage: { in: ['QUALIFIED', 'PROPOSAL_SENT'] },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    })
    const revenuePotentialToday = qualifiedLeads > 0 ? qualifiedLeads * 5000 : null

    // 3. Get completed today
    const [tasksDone, messagesSent, quotesSent] = await Promise.all([
      prisma.task.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      repliesToday, // Reuse from above
      quotesToday, // Reuse from above
    ])

    // 4. Build focusNow + upNext (prioritized)
    const candidates: CommandItem[] = []

    // Priority 1: Conversations needing reply
    const conversationsNeedingReply = await prisma.conversation.findMany({
      where: {
        OR: [
          { unreadCount: { gt: 0 } },
          { needsReplySince: { not: null, lte: now } },
        ],
        lead: {
          stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        },
      },
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true, phone: true } },
            serviceType: { select: { name: true } },
          },
        },
        messages: {
          where: { direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true },
        },
      },
      orderBy: [
        { needsReplySince: 'asc' },
        { lastMessageAt: 'desc' },
      ],
      take: 5,
    })

    for (const conv of conversationsNeedingReply) {
      const lead = conv.lead
      const contact = lead?.contact
      const serviceName = lead?.serviceType?.name || lead?.serviceTypeEnum || 'Service'
      const lastMessage = conv.messages[0]?.body || ''
      const preview = lastMessage.length > 60 ? lastMessage.substring(0, 60) + '...' : lastMessage
      
      let slaLabel: string | undefined
      if (conv.needsReplySince) {
        const hoursSince = (now.getTime() - conv.needsReplySince.getTime()) / (1000 * 60 * 60)
        if (hoursSince > 24) {
          slaLabel = 'SLA breach'
        } else if (hoursSince > 10) {
          slaLabel = 'SLA risk'
        }
      }

      candidates.push({
        kind: 'reply',
        id: `reply:${conv.id}`,
        leadId: lead?.id,
        conversationId: conv.id,
        title: `Reply to ${contact?.fullName || 'Customer'} (${serviceName})`,
        preview,
        channel: (conv.channel?.toLowerCase() || 'whatsapp') as any,
        slaLabel,
        primaryCta: {
          label: 'Open & Reply',
          href: `/leads/${lead?.id}`,
          action: 'open_reply',
        },
      })
    }

    // Priority 2: Tasks overdue
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: { lte: now },
        lead: {
          stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        },
      },
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true } },
            serviceType: { select: { name: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 5,
    })

    for (const task of overdueTasks) {
      const lead = task.lead
      const contact = lead?.contact
      const serviceName = lead?.serviceType?.name || lead?.serviceTypeEnum || 'Service'
      
      candidates.push({
        kind: 'task',
        id: `task:${task.id}`,
        leadId: lead?.id,
        taskId: task.id,
        title: `${task.title} — ${contact?.fullName || 'Lead'} (${serviceName})`,
        primaryCta: {
          label: 'Open Task',
          href: `/leads/${lead?.id}`,
          action: 'open_lead',
        },
      })
    }

    // Priority 3: Leads ready for quote
    const quoteTasks = await prisma.task.findMany({
      where: {
        type: { in: ['QUOTE', 'PROPOSAL'] },
        status: 'OPEN',
        dueAt: { lte: now },
        lead: {
          stage: { in: ['QUALIFIED', 'PROPOSAL_SENT'] },
        },
      },
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true } },
            serviceType: { select: { name: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 5,
    })

    for (const task of quoteTasks) {
      const lead = task.lead
      const contact = lead?.contact
      const serviceName = lead?.serviceType?.name || lead?.serviceTypeEnum || 'Service'
      
      candidates.push({
        kind: 'quote',
        id: `quote:${task.id}`,
        leadId: lead?.id,
        taskId: task.id,
        title: `Send quote to ${contact?.fullName || 'Lead'} (${serviceName})`,
        revenueHint: 'Quote pending',
        primaryCta: {
          label: 'Create Quote',
          href: `/leads/${lead?.id}`,
          action: 'open_quote',
        },
      })
    }

    // Priority 4: Renewals today/7d
    const renewals = await prisma.lead.findMany({
      where: {
        expiryDate: { gte: now, lte: sevenDaysFromNow },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
      },
      include: {
        contact: { select: { fullName: true } },
        serviceType: { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
      take: 5,
    })

    for (const lead of renewals) {
      const daysUntil = differenceInDays(lead.expiryDate!, now)
      const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
      
      candidates.push({
        kind: 'renewal',
        id: `renewal:${lead.id}`,
        leadId: lead.id,
        title: `Renewal due: ${lead.contact?.fullName || 'Lead'} (${serviceName})`,
        revenueHint: 'Renewal likely',
        primaryCta: {
          label: 'Open Lead',
          href: `/leads/${lead.id}`,
          action: 'open_lead',
        },
      })
    }

    // Priority 5: Waiting on customer > 2 days
    // Filter in memory since Prisma can't compare fields directly
    const waitingLeadsRaw = await prisma.lead.findMany({
      where: {
        lastOutboundAt: { not: null, lte: twoDaysAgo },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
      },
      include: {
        contact: { select: { fullName: true } },
        serviceType: { select: { name: true } },
      },
      orderBy: { lastOutboundAt: 'asc' },
      take: 10, // Get more to filter in memory
    })

    // Filter: lastInboundAt is null OR older than lastOutboundAt
    const waitingLeads = waitingLeadsRaw.filter((lead) => {
      if (!lead.lastOutboundAt) return false
      if (!lead.lastInboundAt) return true // No inbound = waiting
      return lead.lastInboundAt < lead.lastOutboundAt
    })

    for (const lead of waitingLeads.slice(0, 5)) {
      if (!lead.lastOutboundAt) continue
      const daysWaiting = differenceInDays(now, lead.lastOutboundAt)
      const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
      
      candidates.push({
        kind: 'waiting',
        id: `waiting:${lead.id}`,
        leadId: lead.id,
        title: `Follow up: ${lead.contact?.fullName || 'Lead'} (${serviceName})`,
        waitingDays: daysWaiting,
        primaryCta: {
          label: 'Open Lead',
          href: `/leads/${lead.id}`,
          action: 'open_lead',
        },
      })
    }

    // Deduplicate and prioritize
    const seenIds = new Set<string>()
    const uniqueCandidates: CommandItem[] = []
    
    for (const candidate of candidates) {
      if (!seenIds.has(candidate.id)) {
        seenIds.add(candidate.id)
        uniqueCandidates.push(candidate)
      }
    }

    // Focus now: first item (highest priority)
    const focusNow = uniqueCandidates.length > 0 ? uniqueCandidates[0] : null

    // Up next: next 3 items (excluding focus)
    const upNext = uniqueCandidates.slice(1, 4)

    return NextResponse.json({
      focusNow,
      upNext,
      signals,
      momentum: {
        repliesToday,
        quotesToday,
        renewalsNext7Days: renewals7d,
        revenuePotentialToday,
      },
      completedToday: {
        tasksDone,
        messagesSent,
        quotesSent,
      },
      generatedAt: now.toISOString(),
    } as CommandCenterData)
  } catch (error: any) {
    console.error('Failed to load command center data:', error)
    return NextResponse.json(
      {
        focusNow: null,
        upNext: [],
        signals: {
          renewals: [],
          waiting: [],
          alerts: [],
          counts: { renewalsTotal: 0, waitingTotal: 0, alertsTotal: 0 },
        },
        momentum: {
          repliesToday: 0,
          quotesToday: 0,
          renewalsNext7Days: 0,
          revenuePotentialToday: null,
        },
        completedToday: {
          tasksDone: 0,
          messagesSent: 0,
          quotesSent: 0,
        },
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
