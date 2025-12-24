/**
 * Adaptive Scheduling Intelligence
 * 
 * Implements intelligent follow-up scheduling based on:
 * - Channel response patterns
 * - Lead engagement history
 * - Optimal timing suggestions
 */

import { prisma } from '../prisma'

export interface SchedulingRecommendation {
  recommendedChannel: 'WHATSAPP' | 'EMAIL' | 'SMS'
  recommendedTime: Date
  reason: string
  confidence: number
}

/**
 * Analyze lead engagement and suggest optimal follow-up strategy
 */
export async function analyzeAndRecommendFollowUp(
  leadId: number
): Promise<SchedulingRecommendation> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    })

    if (!lead) {
      throw new Error('Lead not found')
    }

    // Analyze recent message patterns
    const recentMessages = lead.messages || []
    const inboundMessages = recentMessages.filter(m => 
      m.direction === 'INBOUND' || m.direction === 'IN'
    )
    const outboundMessages = recentMessages.filter(m => 
      m.direction === 'OUTBOUND' || m.direction === 'OUT'
    )

    // Check if lead hasn't responded to last 3 qualifying questions
    const lastThreeOutbound = outboundMessages.slice(0, 3)
    const hasUnansweredQuestions = lastThreeOutbound.length >= 3 && 
      inboundMessages.length === 0

    // Determine primary channel
    const whatsappMessages = recentMessages.filter(m => m.channel === 'whatsapp')
    const emailMessages = recentMessages.filter(m => m.channel === 'email')
    const primaryChannel = whatsappMessages.length > emailMessages.length 
      ? 'WHATSAPP' 
      : 'EMAIL'

    // Calculate response rate
    const responseRate = inboundMessages.length / Math.max(outboundMessages.length, 1)

    // Adaptive scheduling logic
    let recommendedChannel: 'WHATSAPP' | 'EMAIL' | 'SMS' = primaryChannel
    let recommendedTime = new Date()
    let reason = ''
    let confidence = 0.5

    // If no response to 3+ questions on WhatsApp, suggest email or SMS
    if (hasUnansweredQuestions && primaryChannel === 'WHATSAPP') {
      recommendedChannel = 'EMAIL'
      recommendedTime = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours later
      reason = 'No response to last 3 WhatsApp messages. Switching to email to avoid spamming.'
      confidence = 0.8
    } else if (responseRate < 0.3 && outboundMessages.length >= 5) {
      // Low engagement - suggest longer delay
      recommendedChannel = primaryChannel
      recommendedTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days later
      reason = 'Low engagement rate. Suggesting longer delay to avoid over-communication.'
      confidence = 0.7
    } else if (responseRate >= 0.7) {
      // High engagement - can follow up sooner
      recommendedChannel = primaryChannel
      recommendedTime = new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours later
      reason = 'High engagement rate. Lead is responsive, can follow up sooner.'
      confidence = 0.9
    } else {
      // Default: follow up in 24 hours on same channel
      recommendedChannel = primaryChannel
      recommendedTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
      reason = 'Standard follow-up schedule based on channel preference.'
      confidence = 0.6
    }

    // Adjust for working hours (9 AM - 6 PM Dubai time)
    const dubaiTime = new Date(recommendedTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }))
    const hour = dubaiTime.getHours()
    
    if (hour < 9) {
      // Too early, move to 9 AM
      dubaiTime.setHours(9, 0, 0, 0)
      recommendedTime = dubaiTime
      reason += ' Adjusted to working hours (9 AM Dubai time).'
    } else if (hour >= 18) {
      // Too late, move to next day 9 AM
      dubaiTime.setDate(dubaiTime.getDate() + 1)
      dubaiTime.setHours(9, 0, 0, 0)
      recommendedTime = dubaiTime
      reason += ' Adjusted to next working day (9 AM Dubai time).'
    }

    return {
      recommendedChannel,
      recommendedTime,
      reason,
      confidence,
    }
  } catch (error: any) {
    console.error('Adaptive scheduling error:', error)
    // Fallback to default
    return {
      recommendedChannel: 'WHATSAPP',
      recommendedTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reason: 'Error in analysis, using default schedule.',
      confidence: 0.3,
    }
  }
}

/**
 * Two-tier follow-up system:
 * - Cold tasks (>1 hour away): Store in PostgreSQL
 * - Hot tasks (<1 hour away): Move to Redis for fast access
 */
export async function scheduleFollowUp(
  leadId: number,
  scheduledTime: Date,
  taskType: 'followup' | 'expiry_reminder' | 'qualification'
): Promise<void> {
  const now = new Date()
  const hoursUntilExecution = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntilExecution > 1) {
    // Cold storage: Store in PostgreSQL
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        nextFollowUpAt: scheduledTime,
      },
    })

    console.log(`📅 Cold task scheduled for lead ${leadId} at ${scheduledTime.toISOString()}`)
  } else {
    // Hot storage: Add to Redis queue
    try {
      const { enqueueAutomation } = await import('../queue/automationQueue')
      const delay = Math.max(0, scheduledTime.getTime() - now.getTime())
      
      await enqueueAutomation('followup_scheduled', {
        leadId,
        taskType,
        scheduledTime: scheduledTime.toISOString(),
      }, {
        delay,
        priority: 5,
      })

      console.log(`🔥 Hot task queued for lead ${leadId} (executes in ${Math.round(delay / 1000 / 60)} minutes)`)
    } catch (error) {
      // Fallback to PostgreSQL if Redis unavailable
      console.warn('Redis unavailable, storing in PostgreSQL:', error)
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          nextFollowUpAt: scheduledTime,
        },
      })
    }
  }
}

