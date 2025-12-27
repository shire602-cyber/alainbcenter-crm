import { NextRequest, NextResponse } from 'next/server'
import { requireAuthOrAgentApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp'
import { normalizeToE164 } from '@/lib/phone'

/**
 * POST /api/whatsapp/send
 * Send WhatsApp message to a contact
 * 
 * Input:
 * {
 *   contactId: number (required)
 *   message?: string (required if no templateId)
 *   templateId?: number (required if no message)
 *   templateParams?: string[] (optional, for template variables)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthOrAgentApi()

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { contactId, message, templateId, templateParams } = body

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    if (!message && !templateId) {
      return NextResponse.json(
        { error: 'Either message or templateId is required' },
        { status: 400 }
      )
    }

    // Get contact
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Check opt-out
    if ((contact as any).whatsappOptOut) {
      return NextResponse.json(
        { error: 'Contact has opted out of WhatsApp messages' },
        { status: 403 }
      )
    }

    // Rate limiting: max 3 messages per hour per contact
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentMessages = await prisma.communicationLog.count({
      where: {
        lead: {
          contactId: contact.id,
        },
        channel: 'whatsapp',
        direction: 'outbound',
        createdAt: {
          gte: oneHourAgo,
        },
      },
    })

    if (recentMessages >= 3) {
      return NextResponse.json(
        {
          error:
            'Rate limit exceeded. Maximum 3 WhatsApp messages per hour per contact. Please try again later.',
        },
        { status: 429 }
      )
    }

    // Get or find lead
    const lead = contact.leads[0] || null

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found. Please create a lead for this contact first.' },
        { status: 404 }
      )
    }

    // Normalize phone to E.164
    let normalizedPhone: string
    try {
      normalizedPhone = normalizeToE164(contact.phone)
    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid phone number format: ${error.message}` },
        { status: 400 }
      )
    }

    // Send message
    let result: { messageId: string; waId?: string }
    let messageContent = message

    if (templateId) {
      // Load template
      const template = await (prisma as any).whatsAppTemplate?.findUnique({
        where: { id: templateId },
      })

      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      if (template.status !== 'approved') {
        return NextResponse.json(
          { error: 'Template is not approved. Only approved templates can be sent.' },
          { status: 400 }
        )
      }

      // Send template message
      result = await sendTemplateMessage(
        normalizedPhone,
        template.name,
        template.language,
        templateParams || []
      )

      messageContent = template.body || template.content || 'WhatsApp template message'
    } else {
      // Send text message
      result = await sendTextMessage(normalizedPhone, message!)
    }

    // CRITICAL FIX: Use same conversation for inbound/outbound, always link to lead
    let conversation = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: contact.id,
          channel: 'whatsapp',
        },
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          leadId: lead.id, // CRITICAL: Always link to lead
          channel: 'whatsapp',
          lastMessageAt: new Date(),
        },
      })
      console.log(`✅ [WHATSAPP-SEND] Created conversation ${conversation.id} for contact ${contact.id}, lead ${lead.id}`)
    } else {
      // CRITICAL FIX: Update leadId if it's null or different
      if (!conversation.leadId || conversation.leadId !== lead.id) {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            leadId: lead.id, // Link to current lead
            lastMessageAt: new Date(),
          },
        })
        console.log(`✅ [WHATSAPP-SEND] Updated conversation ${conversation.id} to link to lead ${lead.id}`)
      } else {
        // Update last message timestamp
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
          },
        })
      }
    }

    // Create communication log
    const logData: any = {
      leadId: lead.id,
      conversationId: conversation.id,
      channel: 'whatsapp',
      direction: 'outbound',
      messageSnippet: messageContent?.substring(0, 200) || 'WhatsApp message',
    }

    // Add WhatsApp-specific fields if they exist in schema
    try {
      logData.whatsappMessageId = result.messageId
      logData.deliveryStatus = 'sent'
    } catch {
      // Fields don't exist yet - continue without them
    }

    const communicationLog = await prisma.communicationLog.create({
      data: logData,
    })

    // STEP 2 FIX: Use Message table instead of ChatMessage
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        leadId: lead.id,
        direction: 'OUTBOUND',
        channel: 'WHATSAPP',
        type: 'text',
        body: messageContent || 'WhatsApp message',
        status: 'SENT',
        sentAt: new Date(),
      },
    })

    // Update lead timestamps
    const updateData: any = {
      lastContactAt: new Date(),
    }

    // Set default nextFollowUpAt if empty
    if (!lead.nextFollowUpAt) {
      const twoDaysFromNow = new Date()
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2)
      updateData.nextFollowUpAt = twoDaysFromNow
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: updateData,
    })

    return NextResponse.json({
      ok: true,
      whatsappMessageId: result.messageId,
      waId: result.waId,
      communicationLogId: communicationLog.id,
    })
  } catch (error: any) {
    console.error('POST /api/whatsapp/send error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send WhatsApp message' },
      { status: error.statusCode || 500 }
    )
  }
}
