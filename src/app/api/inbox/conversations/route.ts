import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * Extract Instagram profile photo from conversation knownFields
 */
function extractInstagramProfilePhoto(conv: any): string | null {
  if (!conv.knownFields) {
    return null
  }
  
  try {
    const knownFields = typeof conv.knownFields === 'string' 
      ? JSON.parse(conv.knownFields) 
      : conv.knownFields
    
    if (knownFields?.instagramProfilePic) {
      return knownFields.instagramProfilePic
    }
  } catch (error) {
    // Ignore parse errors
  }
  
  return null
}

/**
 * GET /api/inbox/conversations
 * Returns list of conversations sorted by lastMessageAt (desc)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // Default to 'all' instead of 'whatsapp' to show all channels by default
    // Frontend already passes 'channel=all' when activeChannel is 'all', but this ensures correct default
    const channelParam = req.nextUrl.searchParams.get('channel') || 'all'

    // Build where clause - if channel is 'all', don't filter by channel
    // Try to use deletedAt if available, but fallback gracefully if column doesn't exist
    const whereClause: any = {}
    
    if (channelParam && channelParam !== 'all') {
      // Normalize channel to lowercase to match database storage
      // All channels are stored as lowercase in the database
      whereClause.channel = channelParam.toLowerCase()
    }

    // Query conversations - handle gracefully if deletedAt doesn't exist
    let conversations
    try {
      // First try with deletedAt filter (if column exists)
      const whereWithDeletedAt: any = {
        OR: [
          { deletedAt: null },
          {
            deletedAt: { not: null },
            lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        ],
        ...whereClause,
      }
      
      conversations = await prisma.conversation.findMany({
        where: {
          ...whereWithDeletedAt,
          // Only include conversations that have at least one message
          messages: {
            some: {},
          },
        },
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
          knownFields: true, // Include to extract Instagram profile photo
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
        take: 500,
      })
    } catch (error: any) {
      // If deletedAt column doesn't exist, retry without it (graceful fallback)
      if (error.code === 'P2022' || error.message?.includes('deletedAt') || error.message?.includes('does not exist') || error.message?.includes('Unknown column') || error.message?.includes('column') && error.message?.includes('deleted')) {
        console.warn('[DB] deletedAt column not found, querying without it (this is OK if migration not yet applied)')
        // Retry without deletedAt filter - just use channel filter
        try {
          conversations = await prisma.conversation.findMany({
            where: {
              ...whereClause,
              // Only include conversations that have at least one message
              messages: {
                some: {},
              },
            },
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
              knownFields: true, // Include to extract Instagram profile photo
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
            take: 500,
          })
        } catch (retryError: any) {
          console.error('[DB] Failed to query conversations:', retryError)
          throw retryError
        }
      } else {
        throw error
      }
    }

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
    
          const instagramProfilePic = extractInstagramProfilePhoto(conv)
          
          // Log Instagram conversations for debugging
          if (conv.channel === 'instagram') {
            console.log(`📸 [INBOX-API] Instagram conversation found`, {
              conversationId: conv.id,
              contactId: conv.contact.id,
              contactName: conv.contact.fullName,
              contactPhone: conv.contact.phone,
              hasMessages: conv.messages.length > 0,
              messageCount: conv.messages.length,
              lastMessageAt: conv.lastMessageAt.toISOString(),
              unreadCount: conv.unreadCount,
            })
          }
          
          return {
            id: conv.id,
            contact: {
              id: conv.contact.id,
              fullName: conv.contact.fullName,
              phone: conv.contact.phone,
              email: conv.contact.email,
              profilePhoto: instagramProfilePic, // Include Instagram profile photo if available
            },
            channel: conv.channel,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt.toISOString(),
            lastInboundAt: conv.lastInboundAt?.toISOString() || null,
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
    
        // Log summary for debugging
        const instagramCount = formatted.filter((c: any) => c.channel === 'instagram').length
        if (instagramCount > 0 || channelParam === 'instagram' || channelParam === 'all') {
          console.log(`📊 [INBOX-API] Conversations query result`, {
            totalCount: formatted.length,
            instagramCount,
            channelParam,
            channels: formatted.reduce((acc: any, c: any) => {
              acc[c.channel] = (acc[c.channel] || 0) + 1
              return acc
            }, {} as Record<string, number>),
          })
        }
        
        // Sort by lastMessageAt descending (most recent messages on top)
        // Secondary sort by priorityScore for conversations with same timestamp
        formatted.sort((a: any, b: any) => {
          // Primary sort: lastMessageAt (descending - most recent first)
          const timeA = new Date(a.lastMessageAt).getTime()
          const timeB = new Date(b.lastMessageAt).getTime()
          if (timeB !== timeA) {
            return timeB - timeA // Descending - most recent first
          }
          // Secondary sort: priorityScore (descending - higher priority first)
          if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore
          }
          // Tertiary sort: lastInboundAt if available
          const inboundA = a.lastInboundAt ? new Date(a.lastInboundAt).getTime() : 0
          const inboundB = b.lastInboundAt ? new Date(b.lastInboundAt).getTime() : 0
          return inboundB - inboundA
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
