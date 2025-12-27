/**
 * CRM ANALYTICS & METRICS
 * 
 * Phase 8: Track and expose:
 * - Auto-reply success rate
 * - Qualification completion rate
 * - Response time SLA
 * - Follow-up conversion
 * - Renewal revenue generated
 */

import { prisma } from '../prisma'
import { subDays, startOfDay, endOfDay } from 'date-fns'

export interface CRMMetrics {
  period: {
    start: Date
    end: Date
  }
  autoReply: {
    totalAttempts: number
    successful: number
    failed: number
    successRate: number
  }
  qualification: {
    leadsQualified: number
    leadsTotal: number
    completionRate: number
    avgQuestionsAsked: number
  }
  responseTime: {
    avgResponseTimeMinutes: number
    slaBreaches: number
    slaComplianceRate: number
  }
  followUp: {
    followupsSent: number
    conversions: number
    conversionRate: number
  }
  renewals: {
    renewalsIdentified: number
    renewalsCompleted: number
    revenueGenerated: number
  }
}

/**
 * Get CRM metrics for a date range
 */
export async function getCRMMetrics(
  startDate: Date,
  endDate: Date
): Promise<CRMMetrics> {
  const start = startOfDay(startDate)
  const end = endOfDay(endDate)

  // Auto-reply metrics
  const autoReplyLogs = await prisma.autoReplyLog.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
  })

  const autoReplyTotal = autoReplyLogs.length
  const autoReplySuccessful = autoReplyLogs.filter((log) => log.replySent === true).length
  const autoReplyFailed = autoReplyTotal - autoReplySuccessful
  const autoReplySuccessRate = autoReplyTotal > 0 ? (autoReplySuccessful / autoReplyTotal) * 100 : 0

  // Qualification metrics
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      conversations: {
        include: {
          messages: {
            where: {
              direction: 'OUTBOUND',
            },
          },
        },
      },
    },
  })

  const leadsTotal = leads.length
  const leadsQualified = leads.filter((lead) => lead.stage === 'QUALIFIED' || lead.aiScore !== null).length
  const qualificationCompletionRate = leadsTotal > 0 ? (leadsQualified / leadsTotal) * 100 : 0

  // Calculate avg questions asked (from conversation.collectedData)
  let totalQuestions = 0
  let conversationsWithQuestions = 0
  for (const lead of leads) {
    for (const conversation of lead.conversations) {
      if (conversation.collectedData) {
        try {
          const data = JSON.parse(conversation.collectedData)
          const questionKeys = Object.keys(data).filter((k) => k.startsWith('question_'))
          if (questionKeys.length > 0) {
            totalQuestions += questionKeys.length
            conversationsWithQuestions++
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }
  }
  const avgQuestionsAsked = conversationsWithQuestions > 0 ? totalQuestions / conversationsWithQuestions : 0

  // Response time SLA (target: < 10 minutes for first reply)
  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 2, // First inbound and first outbound
      },
    },
  })

  let totalResponseTime = 0
  let responseCount = 0
  let slaBreaches = 0
  const SLA_TARGET_MINUTES = 10

  for (const conversation of conversations) {
    const firstInbound = conversation.messages.find((m) => m.direction === 'INBOUND' || m.direction === 'IN')
    const firstOutbound = conversation.messages.find((m) => m.direction === 'OUTBOUND' || m.direction === 'OUT')

    if (firstInbound && firstOutbound && firstOutbound.createdAt > firstInbound.createdAt) {
      const responseTimeMinutes = (firstOutbound.createdAt.getTime() - firstInbound.createdAt.getTime()) / (1000 * 60)
      totalResponseTime += responseTimeMinutes
      responseCount++

      if (responseTimeMinutes > SLA_TARGET_MINUTES) {
        slaBreaches++
      }
    }
  }

  const avgResponseTimeMinutes = responseCount > 0 ? totalResponseTime / responseCount : 0
  const slaComplianceRate = responseCount > 0 ? ((responseCount - slaBreaches) / responseCount) * 100 : 0

  // Follow-up conversion
  const followupMessages = await prisma.message.findMany({
    where: {
      direction: 'OUTBOUND',
      createdAt: {
        gte: start,
        lte: end,
      },
      body: {
        contains: 'follow',
      },
    },
    include: {
      conversation: {
        include: {
          messages: {
            where: {
              direction: 'INBOUND',
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  const followupsSent = followupMessages.length
  const conversions = followupMessages.filter((msg) => {
    const replyAfter = msg.conversation.messages.find(
      (m) => m.createdAt > msg.createdAt && (m.direction === 'INBOUND' || m.direction === 'IN')
    )
    return !!replyAfter
  }).length
  const followupConversionRate = followupsSent > 0 ? (conversions / followupsSent) * 100 : 0

  // Renewal metrics
  const expiryItems = await prisma.expiryItem.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      renewalLead: {
        select: {
          estimatedRenewalValue: true,
        },
      },
    },
  })

  const renewalsIdentified = expiryItems.length
  const renewalsCompleted = expiryItems.filter((item) => item.renewalStatus === 'RENEWED').length
  const revenueGenerated = expiryItems
    .filter((item) => item.renewalStatus === 'RENEWED' && item.renewalLead?.estimatedRenewalValue)
    .reduce((sum, item) => {
      const value = parseFloat(item.renewalLead!.estimatedRenewalValue || '0')
      return sum + value
    }, 0)

  return {
    period: {
      start,
      end,
    },
    autoReply: {
      totalAttempts: autoReplyTotal,
      successful: autoReplySuccessful,
      failed: autoReplyFailed,
      successRate: Math.round(autoReplySuccessRate * 100) / 100,
    },
    qualification: {
      leadsQualified,
      leadsTotal,
      completionRate: Math.round(qualificationCompletionRate * 100) / 100,
      avgQuestionsAsked: Math.round(avgQuestionsAsked * 100) / 100,
    },
    responseTime: {
      avgResponseTimeMinutes: Math.round(avgResponseTimeMinutes * 100) / 100,
      slaBreaches,
      slaComplianceRate: Math.round(slaComplianceRate * 100) / 100,
    },
    followUp: {
      followupsSent,
      conversions,
      conversionRate: Math.round(followupConversionRate * 100) / 100,
    },
    renewals: {
      renewalsIdentified,
      renewalsCompleted,
      revenueGenerated: Math.round(revenueGenerated * 100) / 100,
    },
  }
}

/**
 * Get metrics for last N days
 */
export async function getCRMMetricsLastNDays(days: number = 30): Promise<CRMMetrics> {
  const endDate = new Date()
  const startDate = subDays(endDate, days)
  return getCRMMetrics(startDate, endDate)
}

