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

    return NextResponse.json({
      success: true,
      summary: {
        totalInboundMessages: recentMessages.length,
        totalConversations: recentConversations.length,
        totalWebhookEvents: recentWebhookEvents.length,
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
      recentWebhookEvents: recentWebhookEvents.map((event) => ({
        id: event.id,
        externalId: event.externalId,
        receivedAt: event.receivedAt?.toISOString(),
        payloadPreview: event.payload ? JSON.parse(event.payload).substring(0, 200) : null,
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

