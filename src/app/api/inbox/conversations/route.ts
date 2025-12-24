import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
/**
 * GET /api/inbox/conversations
 * Returns list of conversations sorted by lastMessageAt (desc)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const channelParam = req.nextUrl.searchParams.get('channel') || 'whatsapp'

    // Build where clause - if channel is 'all', don't filter by channel
    const whereClause: any = {}
    if (channelParam && channelParam !== 'all') {
      whereClause.channel = channelParam
    }

    // Optimized: Limit results and use selective loading
    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      select: {
        id: true,
        channel: true,
        status: true,
        lastMessageAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        unreadCount: true,
        priorityScore: true,
        createdAt: true,
        contactId: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        // Only get last message (already optimized)
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            direction: true,
            body: true,
            createdAt: true,
          },
        },
        // Only get nearest expiry item (already optimized)
        lead: {
          select: {
            id: true,
            aiScore: true,
            nextFollowUpAt: true,
            expiryItems: {
              orderBy: { expiryDate: 'asc' },
              take: 1,
              select: {
                expiryDate: true,
              },
            },
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
      // Add limit to prevent fetching too many conversations at once
      take: 500, // Reasonable limit for inbox view
    })

        // Compute intelligence flags directly from fetched data (optimized - no extra queries)
        const now = new Date()
        const NEEDS_REPLY_THRESHOLD_MINUTES = 15
        const SLA_THRESHOLD_MINUTES = 60
        const EXPIRY_SOON_DAYS = 90
        const HOT_SCORE_THRESHOLD = 70
    
        const formatted = conversations.map((conv: (typeof conversations)[0]) => {
          const lastMessage = conv.messages[0]
          
          // Calculate metrics from already-fetched data
          const minutesSinceLastInbound = conv.lastInboundAt
            ? Math.floor((now.getTime() - conv.lastInboundAt.getTime()) / (1000 * 60))
            : null
          const minutesSinceLastOutbound = conv.lastOutboundAt
            ? Math.floor((now.getTime() - conv.lastOutboundAt.getTime()) / (1000 * 60))
            : null
          const minutesSinceCreated = Math.floor((now.getTime() - conv.createdAt.getTime()) / (1000 * 60))
          
          const nearestExpiry = conv.lead?.expiryItems?.[0]
          const daysToNearestExpiry = nearestExpiry
            ? Math.floor((nearestExpiry.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null
          
          // Compute flags from already-fetched data
          const UNREAD = conv.unreadCount > 0
          const NEEDS_REPLY = (lastMessage?.direction === 'inbound' || lastMessage?.direction === 'IN' || lastMessage?.direction === 'INBOUND') && 
            minutesSinceLastInbound !== null &&
            minutesSinceLastInbound >= NEEDS_REPLY_THRESHOLD_MINUTES &&
            (!conv.lastOutboundAt || conv.lastOutboundAt < conv.lastInboundAt!)
          const SLA_BREACH = conv.lastInboundAt && 
            (!conv.lastOutboundAt || 
             (conv.lastOutboundAt && 
              Math.floor((conv.lastOutboundAt.getTime() - conv.lastInboundAt.getTime()) / (1000 * 60)) > SLA_THRESHOLD_MINUTES))
          const EXPIRY_SOON = daysToNearestExpiry !== null && 
            daysToNearestExpiry <= EXPIRY_SOON_DAYS && 
            daysToNearestExpiry >= 0
          const OVERDUE_FOLLOWUP = conv.lead?.nextFollowUpAt !== null &&
            conv.lead?.nextFollowUpAt !== undefined &&
            conv.lead.nextFollowUpAt < now
          const HOT = (conv.lead?.aiScore || 0) >= HOT_SCORE_THRESHOLD
          
          // Calculate priority score
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
          
          const flags = {
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
    
          return {
            id: conv.id,
            contact: {
              id: conv.contact.id,
              fullName: conv.contact.fullName,
              phone: conv.contact.phone,
              email: conv.contact.email,
            },
            channel: conv.channel,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt.toISOString(),
            unreadCount: conv.unreadCount,
            priorityScore: conv.priorityScore || flags.priorityScore,
            flags: {
              UNREAD: flags.UNREAD,
              NEEDS_REPLY: flags.NEEDS_REPLY,
              SLA_BREACH: flags.SLA_BREACH,
              EXPIRY_SOON: flags.EXPIRY_SOON,
              OVERDUE_FOLLOWUP: flags.OVERDUE_FOLLOWUP,
              HOT: flags.HOT,
            },
            metrics: flags.metrics,
            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  direction: lastMessage.direction,
                  body: lastMessage.body || '',
                  createdAt: lastMessage.createdAt.toISOString(),
                }
              : null,
            createdAt: conv.createdAt.toISOString(),
          }
        })
    
        // Sort by priorityScore desc (highest priority first), then lastMessageAt desc as tiebreaker
        formatted.sort((a: { lastMessageAt: string; priorityScore: number }, b: { lastMessageAt: string; priorityScore: number }) => {
          // Primary sort: priorityScore (descending - higher priority first)
          if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore
          }
          // Tiebreaker: lastMessageAt (descending - most recent first)
          const timeA = new Date(a.lastMessageAt).getTime()
          const timeB = new Date(b.lastMessageAt).getTime()
          return timeB - timeA
        })

    return NextResponse.json({ ok: true, conversations: formatted })
  } catch (error: any) {
    console.error('GET /api/inbox/conversations error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load conversations' },
      { status: error.statusCode || 500 }
    )
  }
}
