import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'

/**
 * POST /api/inbox/conversations/[id]/messages
 * Sends a WhatsApp reply via Meta Graph API and logs outbound Message(OUT)
 * Uses env vars: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
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
        },
        { status: 400 }
      )
    }

    // Only allow WhatsApp channel
    if (conversation.channel !== 'whatsapp') {
      return NextResponse.json(
        {
          ok: false,
          error: `Reply not supported for ${conversation.channel} channel`,
        },
        { status: 400 }
      )
    }

    // Get WhatsApp credentials from env vars
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'WhatsApp configuration missing',
          hint: 'WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set in environment variables',
        },
        { status: 500 }
      )
    }

    // Normalize phone number (ensure E.164 format)
    let normalizedPhone = conversation.contact.phone
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone.replace(/^\+/, '')
    }

    // Send WhatsApp message via Meta Graph API
    const sentAt = new Date()
    let whatsappMessageId: string | null = null
    let sendError: any = null

    try {
      const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: text.trim(),
        },
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error?.message || `WhatsApp API error: ${response.status}`
        )
      }

      whatsappMessageId = data.messages?.[0]?.id || null

      if (!whatsappMessageId) {
        throw new Error('WhatsApp API did not return a message ID')
      }
    } catch (error: any) {
      console.error('WhatsApp send error:', error)
      sendError = error
      // Continue to create message record with FAILED status
    }

    // Create outbound Message(OUT) record
    const messageStatus = whatsappMessageId ? 'SENT' : 'FAILED'
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: conversation.leadId,
        contactId: conversation.contactId,
        direction: 'outbound', // Direction: OUT for outbound
        channel: 'whatsapp',
        type: 'text',
        body: text.trim(),
        providerMessageId: whatsappMessageId || null,
        status: messageStatus,
        sentAt: sentAt,
        createdByUserId: user.id,
        rawPayload: sendError
          ? JSON.stringify({ error: sendError.message })
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

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sentAt,
        unreadCount: 0, // Clear unread since we replied
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
        providerMessageId: message.providerMessageId,
        createdAt: message.createdAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/messages error:', error)

    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send message' },
      { status: 500 }
    )
  }
}
