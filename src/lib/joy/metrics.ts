/**
 * JOY METRICS - DETERMINISTIC STAFF HAPPINESS METRICS
 * 
 * Computes metrics that make staff feel rewarded and motivated:
 * - Time-to-first-reply (TTFR) today (median)
 * - Tasks completed today
 * - Leads advanced today
 * - Conversations saved from SLA breach
 * - Revenue actions taken
 * 
 * All metrics computed from existing tables (no new schema).
 */

import { prisma } from '../prisma'
import { startOfDay, endOfDay, differenceInMinutes, differenceInHours } from 'date-fns'

export interface JoyMetrics {
  ttfrMedianMinutes: number | null
  tasksDone: number
  leadsAdvanced: number
  savedFromSla: number
  revenueActions: number
  streak: {
    daysActive: number
    todayDone: boolean
  }
}

export interface FrictionAlerts {
  highTtfr: boolean
  overdueTasks: number
  waitingLong: number
}

/**
 * Compute Time-to-First-Reply (TTFR) median for today
 * TTFR = time between first inbound message and first outbound reply
 */
async function computeTTFRMedianToday(): Promise<number | null> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())

    // Get conversations that had first reply today
    const conversations = await prisma.conversation.findMany({
    where: {
      lastOutboundAt: {
        gte: todayStart,
        lte: todayEnd,
      },
      lastInboundAt: {
        not: null,
      },
    },
    include: {
      messages: {
        where: {
          direction: 'INBOUND',
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 1,
      },
    },
  })

  const ttfrValues: number[] = []

  for (const conv of conversations) {
    const firstInbound = conv.messages[0]
    if (!firstInbound || !conv.lastOutboundAt) continue

    // Find first outbound after this inbound
    const firstOutbound = await prisma.message.findFirst({
      where: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        createdAt: {
          gte: firstInbound.createdAt,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (firstOutbound) {
      const minutes = differenceInMinutes(firstOutbound.createdAt, firstInbound.createdAt)
      if (minutes >= 0 && minutes < 1440) { // Within 24 hours
        ttfrValues.push(minutes)
      }
    }
  }

  if (ttfrValues.length === 0) return null

    // Calculate median
    ttfrValues.sort((a, b) => a - b)
    const mid = Math.floor(ttfrValues.length / 2)
    return ttfrValues.length % 2 === 0
      ? (ttfrValues[mid - 1] + ttfrValues[mid]) / 2
      : ttfrValues[mid]
  } catch (error: any) {
    console.error('Error computing TTFR median:', error)
    return null
  }
}

/**
 * Count tasks completed today
 */
async function countTasksDoneToday(): Promise<number> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())

    return await prisma.task.count({
    where: {
      status: 'COMPLETED',
      updatedAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
    })
  } catch (error: any) {
    console.error('Error counting tasks done today:', error)
    return 0
  }
}

/**
 * Count leads advanced today
 * A lead is "advanced" if:
 * - Stage changed to a higher stage (NEW -> CONTACTED -> ENGAGED -> QUALIFIED -> PROPOSAL_SENT -> COMPLETED_WON)
 * - OR a task was marked handled/completed that indicates progress
 */
async function countLeadsAdvancedToday(): Promise<number> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())

    // Count leads with stage changes today (if we track stage history)
    // For now, count leads that moved to higher stages via tasks
    const advancedLeads = await prisma.task.groupBy({
    by: ['leadId'],
    where: {
      status: 'COMPLETED',
      type: {
        in: ['QUALIFICATION', 'FOLLOW_UP', 'QUOTE', 'PROPOSAL'],
      },
      updatedAt: {
        gte: todayStart,
        lte: todayEnd,
      },
      lead: {
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
    },
    })

    return advancedLeads.length
  } catch (error: any) {
    console.error('Error counting leads advanced today:', error)
    return 0
  }
}

/**
 * Count conversations saved from SLA breach
 * A conversation is "saved" if:
 * - It had needsReplySince set (SLA risk)
 * - An outbound message was sent today before breach threshold (e.g., 24h)
 */
async function countSavedFromSla(): Promise<number> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())
    const breachThresholdHours = 24

    // Get conversations that had SLA risk and were replied to today
    const savedConversations = await prisma.conversation.findMany({
    where: {
      needsReplySince: {
        not: null,
      },
      lastOutboundAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  })

  let savedCount = 0
  for (const conv of savedConversations) {
    if (!conv.needsReplySince || !conv.lastOutboundAt) continue
    
    const hoursSince = differenceInHours(conv.lastOutboundAt, conv.needsReplySince)
      if (hoursSince < breachThresholdHours) {
        savedCount++
      }
    }

    return savedCount
  } catch (error: any) {
    console.error('Error counting saved from SLA:', error)
    return 0
  }
}

/**
 * Count revenue actions taken today
 * Revenue actions = quotes sent + renewals initiated
 */
async function countRevenueActionsToday(): Promise<number> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())

    const [quotesSent, renewalsInitiated] = await Promise.all([
    prisma.task.count({
      where: {
        type: {
          in: ['QUOTE', 'PROPOSAL'],
        },
        status: 'COMPLETED',
        updatedAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    }),
    prisma.task.count({
      where: {
        type: 'RENEWAL',
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    }),
    ])

    return quotesSent + renewalsInitiated
  } catch (error: any) {
    console.error('Error counting revenue actions today:', error)
    return 0
  }
}

/**
 * Compute streak (days active, today done)
 * A day is "active" if:
 * - At least one task completed OR
 * - At least one message sent OR
 * - At least one lead advanced
 */
async function computeStreak(): Promise<{ daysActive: number; todayDone: boolean }> {
  try {
    const todayStart = startOfDay(new Date())
    const todayEnd = endOfDay(new Date())

    // Check if today is done
    const [tasksToday, messagesToday, leadsToday] = await Promise.all([
    prisma.task.count({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.message.count({
      where: {
        direction: 'OUTBOUND',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    countLeadsAdvancedToday(),
  ])

  const todayDone = tasksToday > 0 || messagesToday > 0 || leadsToday > 0

  // Count consecutive days active (simplified: check last 30 days)
  let daysActive = 0
  for (let i = 0; i < 30; i++) {
    const dayStart = startOfDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
    const dayEnd = endOfDay(dayStart)

    const [tasks, messages, leads] = await Promise.all([
      prisma.task.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      prisma.task.count({
        where: {
          status: 'COMPLETED',
          type: { in: ['QUALIFICATION', 'FOLLOW_UP', 'QUOTE', 'PROPOSAL'] },
          updatedAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ])

      if (tasks > 0 || messages > 0 || leads > 0) {
        daysActive++
      } else {
        break // Streak broken
      }
    }

    return { daysActive, todayDone }
  } catch (error: any) {
    console.error('Error computing streak:', error)
    return { daysActive: 0, todayDone: false }
  }
}

/**
 * Compute all joy metrics
 */
export async function computeJoyMetrics(): Promise<JoyMetrics> {
  const [
    ttfrMedianMinutes,
    tasksDone,
    leadsAdvanced,
    savedFromSla,
    revenueActions,
    streak,
  ] = await Promise.all([
    computeTTFRMedianToday(),
    countTasksDoneToday(),
    countLeadsAdvancedToday(),
    countSavedFromSla(),
    countRevenueActionsToday(),
    computeStreak(),
  ])

  return {
    ttfrMedianMinutes,
    tasksDone,
    leadsAdvanced,
    savedFromSla,
    revenueActions,
    streak,
  }
}

/**
 * Compute friction alerts (quiet, subtle)
 */
export async function computeFrictionAlerts(): Promise<FrictionAlerts> {
  try {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [ttfrMedian, overdueTasks, waitingLeadsRaw] = await Promise.all([
    computeTTFRMedianToday(),
    prisma.task.count({
      where: {
        status: 'OPEN',
        dueAt: { lte: now },
      },
    }),
    // Filter in memory since Prisma can't compare fields directly
    prisma.lead.findMany({
      where: {
        lastOutboundAt: {
          not: null,
          lte: sevenDaysAgo,
        },
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
      select: {
        id: true,
        lastOutboundAt: true,
        lastInboundAt: true,
      },
      take: 100, // Cap for performance
    }),
  ])

  // Filter waiting leads in memory
  const waitingLong = waitingLeadsRaw.filter(lead => {
    if (!lead.lastOutboundAt) return false
    if (!lead.lastInboundAt) return true // No inbound = waiting
    return lead.lastInboundAt < lead.lastOutboundAt
  }).length

    // High TTFR = median > 2 hours (120 minutes)
    const highTtfr = ttfrMedian !== null && ttfrMedian > 120

    return {
      highTtfr,
      overdueTasks,
      waitingLong,
    }
  } catch (error: any) {
    console.error('Error computing friction alerts:', error)
    // Return safe defaults
    return {
      highTtfr: false,
      overdueTasks: 0,
      waitingLong: 0,
    }
  }
}

