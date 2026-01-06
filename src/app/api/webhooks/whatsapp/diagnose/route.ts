import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/whatsapp/diagnose
 * Diagnostic endpoint to check if messages are being stored correctly
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    // Get recent messages
    const recentMessages = await prisma.message.findMany({
      where: {
        channel: 'whatsapp',
        direction: 'inbound',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        conversation: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    // Get recent conversations
    const recentConversations = await prisma.conversation.findMany({
      where: {
        channel: 'whatsapp',
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            direction: true,
            body: true,
            createdAt: true,
            providerMessageId: true,
          },
        },
      },
    })

    // Get recent webhook events
    const recentWebhookEvents = await prisma.externalEventLog.findMany({
      where: {
        provider: 'whatsapp',
        externalId: {
          startsWith: 'message-', // Only get message webhook payloads
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        externalId: true,
        receivedAt: true,
        payload: true,
      },
    })
    
    // Parse webhook payloads to extract media information
    const parsedWebhookEvents = recentWebhookEvents.map((event) => {
      let parsedPayload = null
      let mediaInfo = null
      try {
        parsedPayload = JSON.parse(event.payload || '{}')
        if (parsedPayload.message) {
          const msg = parsedPayload.message
          mediaInfo = {
            messageId: msg.id || parsedPayload.messageId,
            messageType: msg.type || parsedPayload.messageType,
            hasAudio: !!msg.audio,
            hasImage: !!msg.image,
            hasDocument: !!msg.document,
            hasVideo: !!msg.video,
            audioKeys: msg.audio ? Object.keys(msg.audio) : [],
            audioId: msg.audio?.id,
            audioMediaId: msg.audio?.media_id,
            audioMediaIdAlt: msg.audio?.mediaId,
            extractedMediaUrl: parsedPayload.extractedMediaUrl,
            audioObject: msg.audio || null,
            fullMessageObject: msg,
          }
        }
      } catch (e) {
        // Payload might not be valid JSON
      }
      return {
        id: event.id,
        externalId: event.externalId,
        receivedAt: event.receivedAt?.toISOString(),
        mediaInfo,
        payloadPreview: event.payload?.substring(0, 500) || null,
      }
    })
    
    // Get recent inbound media messages with null mediaUrl
    const recentMediaMessagesWithoutUrl = await prisma.message.findMany({
      where: {
        channel: 'whatsapp',
        direction: 'INBOUND',
        type: {
          in: ['audio', 'image', 'document', 'video'],
        },
        mediaUrl: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        body: true,
        providerMessageId: true,
        mediaUrl: true,
        mediaMimeType: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      summary: {
        totalInboundMessages: recentMessages.length,
        totalConversations: recentConversations.length,
        totalWebhookEvents: recentWebhookEvents.length,
        mediaMessagesWithoutUrl: recentMediaMessagesWithoutUrl.length,
      },
      recentMessages: recentMessages.map((msg) => ({
        id: msg.id,
        body: msg.body?.substring(0, 50),
        direction: msg.direction,
        providerMessageId: msg.providerMessageId,
        createdAt: msg.createdAt.toISOString(),
        conversationId: msg.conversationId,
        contact: msg.conversation?.contact,
      })),
      recentConversations: recentConversations.map((conv) => ({
        id: conv.id,
        contact: conv.contact,
        lastMessageAt: conv.lastMessageAt?.toISOString(),
        lastInboundAt: conv.lastInboundAt?.toISOString(),
        unreadCount: conv.unreadCount,
        messageCount: conv.messages.length,
        recentMessages: conv.messages,
      })),
          recentWebhookEvents: parsedWebhookEvents,
      recentMediaMessagesWithoutUrl: recentMediaMessagesWithoutUrl.map((msg) => ({
        id: msg.id,
        type: msg.type,
        body: msg.body?.substring(0, 50),
        providerMessageId: msg.providerMessageId,
        mediaUrl: msg.mediaUrl,
        mediaMimeType: msg.mediaMimeType,
        createdAt: msg.createdAt.toISOString(),
      })),
    })
  } catch (error: any) {
    console.error('Diagnostic endpoint error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

