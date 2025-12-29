/**
 * DETERMINISTIC SIGNAL LOGIC
 * 
 * Pure functions that compute Renewals, Waiting, and Alerts signals
 * No LLM, no guessing - only explicit data
 */

import { prisma } from '../prisma'
import { differenceInDays, differenceInHours, parseISO } from 'date-fns'

export type SignalSeverity = 'neutral' | 'warn' | 'urgent'

export interface SignalItem {
  leadId: number
  leadName: string
  serviceTypeEnum: string | null
  serviceTypeName: string | null
  channel: string
  preview: string
  badge: string
  severity: SignalSeverity
  action: {
    type: 'open' | 'assign' | 'create_quote' | 'create_task'
    label: string
    href?: string
  }
}

export interface SignalsData {
  renewals: SignalItem[]
  waiting: SignalItem[]
  alerts: SignalItem[]
  counts: {
    renewalsTotal: number
    waitingTotal: number
    alertsTotal: number
  }
}

/**
 * Get renewal signals (explicit expiry dates only)
 */
export async function getRenewalSignals(limit: number = 5): Promise<SignalItem[]> {
  const now = new Date()
  const futureDate = new Date(now)
  futureDate.setDate(futureDate.getDate() + 90)

  // Get leads with expiry dates within 90 days
  const leads = await prisma.lead.findMany({
    where: {
      expiryDate: {
        gte: now,
        lte: futureDate,
      },
      stage: {
        notIn: ['COMPLETED_WON', 'LOST'],
      },
    },
    include: {
      contact: {
        select: { fullName: true },
      },
      serviceType: {
        select: { name: true },
      },
      conversations: {
        select: { channel: true },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
      },
    },
    orderBy: { expiryDate: 'asc' },
    take: limit * 2, // Get more to sort by priority
  })

  const signals: SignalItem[] = leads.map((lead) => {
    const expiryDate = lead.expiryDate!
    const daysUntil = differenceInDays(expiryDate, now)
    
    let badge = `${daysUntil}d`
    let severity: SignalSeverity = 'neutral'
    
    if (daysUntil <= 0) {
      badge = 'TODAY'
      severity = 'urgent'
    } else if (daysUntil <= 7) {
      severity = 'urgent'
    } else if (daysUntil <= 30) {
      severity = 'warn'
    }

    const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
    const channel = lead.conversations[0]?.channel || lead.lastContactChannel || 'whatsapp'
    
    return {
      leadId: lead.id,
      leadName: lead.contact?.fullName || 'Unknown',
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceTypeName: serviceName,
      channel,
      preview: `${serviceName} expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
      badge,
      severity,
      action: {
        type: 'open',
        label: 'Open',
        href: `/leads/${lead.id}`,
      },
    }
  })

  // Sort by priority: TODAY > 7d > 30d > 60d > 90d
  signals.sort((a, b) => {
    const aDays = parseInt(a.badge) || (a.badge === 'TODAY' ? 0 : 999)
    const bDays = parseInt(b.badge) || (b.badge === 'TODAY' ? 0 : 999)
    return aDays - bDays
  })

  return signals.slice(0, limit)
}

/**
 * Get waiting on customer signals
 */
export async function getWaitingSignals(limit: number = 5): Promise<SignalItem[]> {
  const now = new Date()
  const twoDaysAgo = new Date(now)
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  // Get leads where:
  // - lastOutboundAt exists (we sent something)
  // - lastOutboundAt is at least 2 days ago
  // We'll filter in memory for lastInboundAt < lastOutboundAt
  const leads = await prisma.lead.findMany({
    where: {
      lastOutboundAt: {
        not: null,
        lte: twoDaysAgo,
      },
      stage: {
        notIn: ['COMPLETED_WON', 'LOST'],
      },
    },
    include: {
      contact: {
        select: { fullName: true },
      },
      serviceType: {
        select: { name: true },
      },
      conversations: {
        select: {
          channel: true,
          lastOutboundAt: true,
          messages: {
            where: { direction: 'OUTBOUND' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true },
          },
        },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
      },
    },
    orderBy: { lastOutboundAt: 'asc' },
    take: limit * 3, // Get more to filter in memory
  })

  // Filter: lastInboundAt is older than lastOutboundAt OR doesn't exist
  const filteredLeads = leads.filter((lead) => {
    if (!lead.lastOutboundAt) return false
    if (!lead.lastInboundAt) return true // No inbound = waiting
    return lead.lastInboundAt < lead.lastOutboundAt
  })

  const signals: SignalItem[] = filteredLeads.map((lead) => {
    const lastOutbound = lead.lastOutboundAt!
    const daysWaiting = differenceInDays(now, lastOutbound)
    
    let badge = `${daysWaiting}d`
    let severity: SignalSeverity = daysWaiting > 7 ? 'warn' : 'neutral'
    
    if (daysWaiting > 7) {
      badge = 'Stalled'
      severity = 'warn'
    } else if (daysWaiting > 2) {
      badge = 'Waiting'
    }

    const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
    const channel = lead.conversations[0]?.channel || lead.lastContactChannel || 'whatsapp'
    const lastMessage = lead.conversations[0]?.messages[0]?.body || null
    const preview = lastMessage 
      ? `Waiting for reply: "${lastMessage.substring(0, 50)}${lastMessage.length > 50 ? '...' : ''}"`
      : 'Waiting for customer reply'

    return {
      leadId: lead.id,
      leadName: lead.contact?.fullName || 'Unknown',
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceTypeName: serviceName,
      channel,
      preview,
      badge,
      severity,
      action: {
        type: 'open',
        label: 'Open',
        href: `/leads/${lead.id}`,
      },
    }
  })

  // Sort by days waiting (longest first)
  signals.sort((a, b) => {
    const aDays = parseInt(a.badge) || (a.badge === 'Stalled' ? 10 : 0)
    const bDays = parseInt(b.badge) || (b.badge === 'Stalled' ? 10 : 0)
    return bDays - aDays
  })

  return signals.slice(0, limit)
}

/**
 * Get alert signals (SLA, unassigned, missing data, quote pending)
 */
export async function getAlertSignals(limit: number = 5): Promise<SignalItem[]> {
  const now = new Date()
  const alerts: SignalItem[] = []

  // 1. SLA breach approaching (needsReplySince exists and > 10 hours)
  const slaThreshold = new Date(now.getTime() - 10 * 60 * 60 * 1000) // 10 hours ago
  
  const slaLeads = await prisma.lead.findMany({
    where: {
      stage: {
        notIn: ['COMPLETED_WON', 'LOST'],
      },
      conversations: {
        some: {
          needsReplySince: {
            not: null,
            lte: slaThreshold,
          },
        },
      },
    },
    include: {
      contact: {
        select: { fullName: true },
      },
      serviceType: {
        select: { name: true },
      },
      conversations: {
        where: {
          needsReplySince: {
            not: null,
            lte: slaThreshold,
          },
        },
        select: {
          channel: true,
          needsReplySince: true,
        },
        take: 1,
      },
    },
    take: 10,
  })

  for (const lead of slaLeads) {
    const conversation = lead.conversations[0]
    if (conversation?.needsReplySince) {
      const hoursSince = differenceInHours(now, conversation.needsReplySince)
      const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
      const channel = conversation.channel || lead.lastContactChannel || 'whatsapp'
      
      alerts.push({
        leadId: lead.id,
        leadName: lead.contact?.fullName || 'Unknown',
        serviceTypeEnum: lead.serviceTypeEnum,
        serviceTypeName: serviceName,
        channel,
        preview: `Customer waiting ${hoursSince}h — SLA risk`,
        badge: hoursSince > 24 ? 'SLA breach' : 'SLA',
        severity: hoursSince > 24 ? 'urgent' : 'warn',
        action: {
          type: 'open',
          label: 'Reply',
          href: `/leads/${lead.id}`,
        },
      })
    }
  }

  // 2. Unassigned owner
  const unassignedLeads = await prisma.lead.findMany({
    where: {
      assignedUserId: null,
      stage: {
        notIn: ['COMPLETED_WON', 'LOST'],
      },
      createdAt: {
        gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    },
    include: {
      contact: {
        select: { fullName: true },
      },
      serviceType: {
        select: { name: true },
      },
      conversations: {
        select: { channel: true },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  for (const lead of unassignedLeads) {
    const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
    const channel = lead.conversations[0]?.channel || lead.lastContactChannel || 'whatsapp'
    
    alerts.push({
      leadId: lead.id,
      leadName: lead.contact?.fullName || 'Unknown',
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceTypeName: serviceName,
      channel,
      preview: 'No assigned owner',
      badge: 'Unassigned',
      severity: 'warn',
      action: {
        type: 'assign',
        label: 'Assign',
        href: `/leads/${lead.id}?action=assign`,
      },
    })
  }

  // 3. Missing qualification (serviceTypeEnum null OR required fields incomplete)
  const missingQualLeads = await prisma.lead.findMany({
    where: {
      OR: [
        { serviceTypeEnum: null },
        { requestedServiceRaw: null },
      ],
      stage: {
        notIn: ['COMPLETED_WON', 'LOST'],
      },
      createdAt: {
        gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
    include: {
      contact: {
        select: { fullName: true, nationality: true },
      },
      conversations: {
        select: { channel: true },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  for (const lead of missingQualLeads) {
    const channel = lead.conversations[0]?.channel || lead.lastContactChannel || 'whatsapp'
    const missingFields: string[] = []
    if (!lead.serviceTypeEnum) missingFields.push('service')
    if (!lead.contact?.nationality) missingFields.push('nationality')
    
    alerts.push({
      leadId: lead.id,
      leadName: lead.contact?.fullName || 'Unknown',
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceTypeName: null,
      channel,
      preview: `Missing: ${missingFields.join(', ')}`,
      badge: 'Missing info',
      severity: 'warn',
      action: {
        type: 'open',
        label: 'Qualify',
        href: `/leads/${lead.id}`,
      },
    })
  }

  // 4. Quote pending (quote task overdue OR lead ready-for-quote but no quote task)
  const quoteReadyLeads = await prisma.lead.findMany({
    where: {
      stage: {
        in: ['QUALIFIED', 'PROPOSAL_SENT'],
      },
      tasks: {
        none: {
          type: {
            in: ['QUOTE', 'PROPOSAL'],
          },
          status: 'OPEN',
        },
      },
    },
    include: {
      contact: {
        select: { fullName: true },
      },
      serviceType: {
        select: { name: true },
      },
      conversations: {
        select: { channel: true },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
      },
      tasks: {
        where: {
          type: {
            in: ['QUOTE', 'PROPOSAL'],
          },
          status: 'OPEN',
          dueAt: {
            lte: now,
          },
        },
        take: 1,
      },
    },
    take: 5,
  })

  for (const lead of quoteReadyLeads) {
    const serviceName = lead.serviceType?.name || lead.serviceTypeEnum || 'Service'
    const channel = lead.conversations[0]?.channel || lead.lastContactChannel || 'whatsapp'
    const hasOverdueQuote = lead.tasks.length > 0
    
    alerts.push({
      leadId: lead.id,
      leadName: lead.contact?.fullName || 'Unknown',
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceTypeName: serviceName,
      channel,
      preview: hasOverdueQuote ? 'Quote task overdue' : 'Ready for quote',
      badge: 'Quote due',
      severity: hasOverdueQuote ? 'urgent' : 'warn',
      action: {
        type: 'create_quote',
        label: 'Create Quote',
        href: `/leads/${lead.id}?action=quote`,
      },
    })
  }

  // Sort by severity (urgent > warn > neutral)
  alerts.sort((a, b) => {
    const severityOrder = { urgent: 0, warn: 1, neutral: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  return alerts.slice(0, limit)
}

/**
 * Get all signals (renewals, waiting, alerts)
 */
export async function getAllSignals(): Promise<SignalsData> {
  const [renewals, waiting, alerts] = await Promise.all([
    getRenewalSignals(5),
    getWaitingSignals(5),
    getAlertSignals(5),
  ])

  // Get total counts (for "View all" links)
  const now = new Date()
  const futureDate = new Date(now)
  futureDate.setDate(futureDate.getDate() + 90)
  const twoDaysAgo = new Date(now)
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const [renewalsTotal, waitingTotal, alertsTotal] = await Promise.all([
    prisma.lead.count({
      where: {
        expiryDate: {
          gte: now,
          lte: futureDate,
        },
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
    }),
    prisma.lead.count({
      where: {
        lastOutboundAt: {
          not: null,
          lte: twoDaysAgo,
        },
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
    }),
    prisma.lead.count({
      where: {
        OR: [
          {
            assignedUserId: null,
            stage: {
              notIn: ['COMPLETED_WON', 'LOST'],
            },
          },
          {
            serviceTypeEnum: null,
            stage: {
              notIn: ['COMPLETED_WON', 'LOST'],
            },
          },
        ],
      },
    }),
  ])

  return {
    renewals,
    waiting,
    alerts,
    counts: {
      renewalsTotal,
      waitingTotal,
      alertsTotal,
    },
  }
}

