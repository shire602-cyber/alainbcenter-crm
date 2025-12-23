import { prisma } from '@/lib/prisma'
import { differenceInMinutes, differenceInDays, parseISO } from 'date-fns'
import { toZonedTime as utcToZonedTime } from 'date-fns-tz'

// Timezone constant
const DUBAI_TZ = 'Asia/Dubai'

// Configuration constants
const NEEDS_REPLY_THRESHOLD_MINUTES = 15
const SLA_THRESHOLD_MINUTES = 60 // First response SLA
const EXPIRY_SOON_DAYS = 90
const HOT_SCORE_THRESHOLD = 70

export type ConversationFlags = {
  UNREAD: boolean
  NEEDS_REPLY: boolean
  SLA_BREACH: boolean
  EXPIRY_SOON: boolean
  OVERDUE_FOLLOWUP: boolean
  HOT: boolean
  priorityScore: number
  metrics: {
    minutesSinceLastInbound: number | null
    minutesSinceLastOutbound: number | null
    minutesSinceCreated: number
    daysToNearestExpiry: number | null
  }
}

/**
 * Compute intelligence flags for a conversation
 */
export async function computeConversationFlags(
  conversationId: number
): Promise<ConversationFlags> {
  const now = new Date()

  // Fetch conversation with relations
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: {
        include: {
          expiryItems: {
            orderBy: { expiryDate: 'asc' },
            take: 1, // Nearest expiry
          },
          assignedUser: true,
        },
      },
      assignedUser: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10, // Last 10 messages to check reply status
      },
    },
  })

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`)
  }

  // Get last inbound and outbound messages
  const lastInbound = conversation.messages.find((m) => m.direction === 'inbound' || m.direction === 'IN' || m.direction === 'INBOUND')
  const lastOutbound = conversation.messages.find((m) => m.direction === 'outbound' || m.direction === 'OUT' || m.direction === 'OUTBOUND')

  const lastInboundAt = lastInbound?.createdAt || conversation.lastInboundAt || conversation.lastMessageAt
  const lastOutboundAt = lastOutbound?.createdAt || conversation.lastOutboundAt || null

  // Calculate metrics
  const minutesSinceLastInbound = lastInbound
    ? differenceInMinutes(now, lastInbound.createdAt)
    : conversation.lastInboundAt
    ? differenceInMinutes(now, conversation.lastInboundAt)
    : null
  const minutesSinceLastOutbound = lastOutbound
    ? differenceInMinutes(now, lastOutbound.createdAt)
    : conversation.lastOutboundAt
    ? differenceInMinutes(now, conversation.lastOutboundAt)
    : null
  const minutesSinceCreated = differenceInMinutes(now, conversation.createdAt)

  // Find nearest expiry
  const nearestExpiry = conversation.lead?.expiryItems?.[0]
  const daysToNearestExpiry = nearestExpiry
    ? differenceInDays(parseISO(nearestExpiry.expiryDate.toISOString()), now)
    : null

  // Compute flags
  const UNREAD = conversation.unreadCount > 0

  // NEEDS_REPLY: last message is inbound, >= 15 mins ago, and no outbound after it
  const NEEDS_REPLY =
    lastInbound !== undefined &&
    minutesSinceLastInbound !== null &&
    minutesSinceLastInbound >= NEEDS_REPLY_THRESHOLD_MINUTES &&
    (!lastOutbound || lastOutbound.createdAt < lastInbound.createdAt)

  // SLA_BREACH: first inbound exists and no outbound within SLA threshold
  const firstInbound = conversation.messages
    .slice()
    .reverse()
    .find((m) => m.direction === 'inbound' || m.direction === 'IN' || m.direction === 'INBOUND')
  const firstOutboundAfterInbound = firstInbound
    ? conversation.messages.find(
        (m) => (m.direction === 'outbound' || m.direction === 'OUT' || m.direction === 'OUTBOUND') && m.createdAt > firstInbound.createdAt
      )
    : null

  const SLA_BREACH =
    firstInbound !== undefined &&
    (!firstOutboundAfterInbound ||
      differenceInMinutes(firstOutboundAfterInbound.createdAt, firstInbound.createdAt) >
        SLA_THRESHOLD_MINUTES)

  // EXPIRY_SOON: any expiry within 90 days
  const EXPIRY_SOON =
    daysToNearestExpiry !== null &&
    daysToNearestExpiry <= EXPIRY_SOON_DAYS &&
    daysToNearestExpiry >= 0

  // OVERDUE_FOLLOWUP: lead has nextFollowUpAt in the past
  const OVERDUE_FOLLOWUP =
    conversation.lead?.nextFollowUpAt !== null &&
    conversation.lead?.nextFollowUpAt !== undefined &&
    conversation.lead.nextFollowUpAt < now

  // HOT: lead aiScore >= 70
  const HOT = (conversation.lead?.aiScore || 0) >= HOT_SCORE_THRESHOLD

  // Calculate priority score (0-100)
  let priorityScore = 0
  if (SLA_BREACH) priorityScore += 35
  if (NEEDS_REPLY) priorityScore += 25
  if (EXPIRY_SOON) {
    if (daysToNearestExpiry !== null && daysToNearestExpiry <= 30) {
      priorityScore += 20
    } else {
      priorityScore += 10
    }
  }
  if (OVERDUE_FOLLOWUP) priorityScore += 15
  if (HOT) priorityScore += 10
  priorityScore = Math.min(priorityScore, 100)

  return {
    UNREAD,
    NEEDS_REPLY,
    SLA_BREACH,
    EXPIRY_SOON,
    OVERDUE_FOLLOWUP,
    HOT,
    priorityScore,
    metrics: {
      minutesSinceLastInbound,
      minutesSinceLastOutbound,
      minutesSinceCreated,
      daysToNearestExpiry,
    },
  }
}

/**
 * Compute flags for multiple conversations (batch)
 */
export async function computeConversationFlagsBatch(
  conversationIds: number[]
): Promise<Map<number, ConversationFlags>> {
  const results = new Map<number, ConversationFlags>()

  // Process in parallel with limit
  const batchSize = 10
  for (let i = 0; i < conversationIds.length; i += batchSize) {
    const batch = conversationIds.slice(i, i + batchSize)
    const promises = batch.map(async (id) => {
      try {
        const flags = await computeConversationFlags(id)
        return { id, flags }
      } catch (error) {
        console.error(`Failed to compute flags for conversation ${id}:`, error)
        return null
      }
    })

    const batchResults = await Promise.all(promises)
    batchResults.forEach((result) => {
      if (result) {
        results.set(result.id, result.flags)
      }
    })
  }

  return results
}