/**
 * GET /api/integrations/meta/webhook-events
 * Show recent webhook events received for debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const igBusinessId = searchParams.get('igBusinessId')
    const eventType = searchParams.get('eventType')

    // Build where clause
    const where: any = {}
    
    // Filter by Instagram Business Account if provided
    if (igBusinessId) {
      // First find connections with this IG Business ID
      const connections = await prisma.metaConnection.findMany({
        where: {
          igBusinessId,
          status: 'connected',
        },
        select: { id: true },
      })
      
      if (connections.length > 0) {
        where.connectionId = {
          in: connections.map(c => c.id),
        }
      } else {
        // No connections found, return empty
        return NextResponse.json({
          success: true,
          events: [],
          total: 0,
          message: `No connections found for IG Business ID: ${igBusinessId}`,
        })
      }
    }

    // Filter by event type if provided
    if (eventType) {
      where.eventType = eventType
    }

    // Get recent webhook events
    const events = await prisma.metaWebhookEvent.findMany({
      where,
      orderBy: {
        receivedAt: 'desc',
      },
      take: limit,
      include: {
        connection: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            igBusinessId: true,
            igUsername: true,
            status: true,
          },
        },
      },
    })

    // Parse payloads and prepare response
    const formattedEvents = events.map((event) => {
      let payload = null
      try {
        payload = typeof event.payload === 'string' 
          ? JSON.parse(event.payload) 
          : event.payload
      } catch {
        payload = { raw: event.payload }
      }

      // Extract relevant info from payload
      const payloadObject = payload?.object || 'unknown'
      const entryId = payload?.entry?.[0]?.id || null
      const hasMessages = !!(payload?.entry?.[0]?.changes?.[0]?.value?.messages?.length ||
                            payload?.entry?.[0]?.messaging?.length)
      
      // For Instagram events, try to extract message info
      let messagePreview = null
      if (payloadObject === 'instagram' && hasMessages) {
        const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages || 
                        payload.entry?.[0]?.messaging?.map((e: any) => e.message).filter(Boolean) ||
                        []
        
        if (messages.length > 0) {
          const firstMessage = messages[0]
          const senderId = firstMessage.from?.id || firstMessage.from || null
          
          // Try to find contact by Instagram user ID to get username
          let senderName = 'unknown'
          if (senderId) {
            try {
              // Instagram contacts use phone format "ig:{userId}"
              const instagramPhone = `ig:${senderId}`
              const contact = await prisma.contact.findFirst({
                where: {
                  phone: instagramPhone,
                },
                select: {
                  fullName: true,
                },
              })
              
              if (contact?.fullName) {
                senderName = contact.fullName
              }
            } catch (contactError: any) {
              // Non-blocking - continue with 'unknown'
              console.warn('Failed to lookup contact for Instagram sender:', contactError.message)
            }
          }
          
          messagePreview = {
            from: senderId || 'unknown',
            fromName: senderName,
            text: firstMessage.text ? `${firstMessage.text.substring(0, 50)}${firstMessage.text.length > 50 ? '...' : ''}` : '[no text]',
            hasText: !!firstMessage.text,
            hasAttachments: !!firstMessage.attachments,
            messageId: firstMessage.id || firstMessage.mid || 'unknown',
          }
        }
      }

      return {
        id: event.id,
        eventType: event.eventType,
        payloadObject,
        entryId,
        hasMessages,
        messagePreview,
        connection: event.connection ? {
          id: event.connection.id,
          pageId: event.connection.pageId,
          pageName: event.connection.pageName,
          igBusinessId: event.connection.igBusinessId,
          igUsername: event.connection.igUsername,
          status: event.connection.status,
        } : null,
        createdAt: event.receivedAt.toISOString(),
        payloadPreview: {
          object: payloadObject,
          entryCount: payload?.entry?.length || 0,
          firstEntryId: entryId,
          hasChanges: !!payload?.entry?.[0]?.changes,
          hasMessaging: !!payload?.entry?.[0]?.messaging,
          changesCount: payload?.entry?.[0]?.changes?.length || 0,
          messagingCount: payload?.entry?.[0]?.messaging?.length || 0,
        },
        // Include full payload for debugging (can be large)
        fullPayload: payload,
      }
    })

    // Get total count for pagination info
    const total = await prisma.metaWebhookEvent.count({ where })

    // Get summary stats
    const stats = {
      total,
      recent24h: await prisma.metaWebhookEvent.count({
          where: {
          ...where,
          receivedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      byEventType: await prisma.metaWebhookEvent.groupBy({
        by: ['eventType'],
        where,
        _count: {
          id: true,
        },
      }),
      byObject: await prisma.metaWebhookEvent.groupBy({
        by: ['eventType'], // We'll extract object from payload
        where,
        _count: {
          id: true,
        },
      }),
    }

    return NextResponse.json({
      success: true,
      events: formattedEvents,
      total,
      limit,
      stats: {
        total: stats.total,
        recent24h: stats.recent24h,
        byEventType: stats.byEventType.map(s => ({
          eventType: s.eventType,
          count: s._count.id,
        })),
      },
      filters: {
        limit,
        igBusinessId: igBusinessId || null,
        eventType: eventType || null,
      },
      message: formattedEvents.length === 0
        ? 'No webhook events found. If you just configured the webhook, wait a few minutes and check again. If no events appear after sending a test DM, verify the webhook is correctly configured in Meta Developer Console.'
        : `Found ${formattedEvents.length} recent webhook event(s)`,
    })
  } catch (error: any) {
    console.error('Get webhook events error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}

