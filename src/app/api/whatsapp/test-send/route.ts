import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { normalizeToE164 } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

/**
 * POST /api/whatsapp/test-send
 * Send a test WhatsApp message (admin only)
 * Used from Settings UI for testing configuration
 * 
 * Input:
 * {
 *   phone?: string (E.164 or UAE format) - required if contactId not provided
 *   contactId?: number - required if phone not provided
 *   message: string (required)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { phone, contactId, message } = body

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!phone && !contactId) {
      return NextResponse.json(
        { error: 'Either phone number or contactId is required' },
        { status: 400 }
      )
    }

    let normalizedPhone: string
    let contactName = 'Test Contact'

    if (contactId) {
      // Get contact by ID
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      })

      if (!contact) {
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        )
      }

      if ((contact as any).whatsappOptOut) {
        return NextResponse.json(
          { error: 'Contact has opted out of WhatsApp messages' },
          { status: 403 }
        )
      }

      contactName = contact.fullName
      
      try {
        normalizedPhone = normalizeToE164(contact.phone)
      } catch (error: any) {
        return NextResponse.json(
          { error: `Invalid phone number format for contact: ${error.message}` },
          { status: 400 }
        )
      }
    } else {
      // Use provided phone number
      try {
        normalizedPhone = normalizeToE164(phone)
      } catch (error: any) {
        return NextResponse.json(
          { error: `Invalid phone number format: ${error.message}` },
          { status: 400 }
        )
      }
    }

    // Find or create contact for test message
    let contact = await prisma.contact.findFirst({
      where: { phone: normalizedPhone },
    })

    if (!contact) {
      // Create a temporary contact for testing
      contact = await prisma.contact.create({
        data: {
          phone: normalizedPhone,
          fullName: contactName,
          source: 'test',
        },
      })
    }

    // Find or create lead for contact
    let lead = await prisma.lead.findFirst({
      where: {
        contactId: contact.id,
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          contactId: contact.id,
          leadType: 'INQUIRY',
          stage: 'NEW',
          source: 'test',
        },
      })
    }

    // Find or create conversation
    const { upsertConversation } = await import('@/lib/conversation/upsert')
    const { getExternalThreadId } = await import('@/lib/conversation/getExternalThreadId')
    
    const { id: conversationId } = await upsertConversation({
      contactId: contact.id,
      channel: 'whatsapp',
      leadId: lead.id,
      externalThreadId: getExternalThreadId('whatsapp', contact),
    })

    // Send test message using proper idempotency method
    const result = await sendOutboundWithIdempotency({
      conversationId,
      contactId: contact.id,
      leadId: lead.id,
      phone: normalizedPhone,
      text: message,
      provider: 'whatsapp',
      triggerProviderMessageId: null, // Test send
      replyType: 'answer',
      lastQuestionKey: null,
      flowStep: null,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      phone: normalizedPhone,
      contactName,
      message: 'Test message sent successfully!',
    })
  } catch (error: any) {
    console.error('POST /api/whatsapp/test-send error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send test message' },
      { status: error.statusCode || 500 }
    )
  }
}
