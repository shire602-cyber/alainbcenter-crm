import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { sendTextMessage } from '@/lib/whatsapp'

/**
 * POST /api/inbox/conversations/[id]/reply
 * Sends a WhatsApp reply and creates outbound message
 * Requires authentication (staff allowed)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { text } = body

    if (!text || !text.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    // Get conversation with contact
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: true,
        lead: true,
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Validate contact has phone
    if (!conversation.contact.phone || !conversation.contact.phone.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Contact does not have a phone number',
          hint: 'Please add a phone number to this contact before sending WhatsApp messages.',
        },
        { status: 400 }
      )
    }

    // Only allow WhatsApp channel for now
    if (conversation.channel !== 'whatsapp') {
      return NextResponse.json(
        {
          ok: false,
          error: `Reply not supported for ${conversation.channel} channel`,
        },
        { status: 400 }
      )
    }

    // Send WhatsApp message
    let whatsappMessageId: string | null = null
    let sendError: any = null
    const sentAt = new Date()
    
    try {
      const result = await sendTextMessage(
        conversation.contact.phone,
        text.trim()
      )
      whatsappMessageId = result.messageId
    } catch (whatsappError: any) {
      console.error('WhatsApp send error:', whatsappError)
      sendError = whatsappError
      // Continue to create message record with FAILED status
    }

    // Create outbound message with new schema fields
    const messageStatus = whatsappMessageId ? 'SENT' : 'FAILED'
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: conversation.leadId,
        contactId: conversation.contactId,
        direction: 'outbound', // OUT for outbound
        channel: 'whatsapp',
        type: 'text',
        body: text.trim(),
        providerMessageId: whatsappMessageId || null, // Store WhatsApp message ID
        status: messageStatus,
        sentAt: sentAt,
        createdByUserId: user.id,
        rawPayload: sendError 
          ? JSON.stringify({ error: sendError.message, stack: sendError.stack })
          : null,
      },
    })

    // Create initial status event
    if (whatsappMessageId) {
      try {
        await prisma.messageStatusEvent.create({
          data: {
            messageId: message.id,
            conversationId: conversation.id,
            status: 'SENT',
            providerStatus: 'sent',
            rawPayload: JSON.stringify({ messageId: whatsappMessageId }),
            receivedAt: sentAt,
          },
        })
      } catch (e) {
        console.warn('Failed to create MessageStatusEvent:', e)
      }
    }

    // Update conversation lastMessageAt and clear unread count (we replied)
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sentAt,
        lastOutboundAt: sentAt, // Track last outbound message timestamp
        unreadCount: 0, // Clear unread since we're viewing and replying
      },
    })

    // Update lead lastContactAt
    if (conversation.leadId) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: {
          lastContactAt: sentAt,
          lastContactChannel: 'whatsapp',
        },
      })
    }

    // Return error if send failed
    if (sendError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to send WhatsApp message',
          hint: sendError.message || 'Check WhatsApp configuration and try again.',
          message: {
            id: message.id,
            direction: message.direction,
            body: message.body,
            status: message.status,
            createdAt: message.createdAt.toISOString(),
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        direction: message.direction,
        body: message.body,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
        meta: message.meta ? JSON.parse(message.meta) : null,
      },
    })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/reply error:', error)

    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send reply' },
      { status: 500 }
    )
  }
}
