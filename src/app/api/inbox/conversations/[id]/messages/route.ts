import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from '@/lib/whatsapp'
import { sendMediaMessageById } from '@/lib/whatsapp-media-upload'

/**
 * POST /api/inbox/conversations/[id]/messages
 * Sends a WhatsApp reply via Meta Graph API and logs outbound Message(OUT)
 * Reads credentials from Integration model (database) first, then falls back to env vars
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
    const { text, templateName, templateParams, mediaUrl, mediaId, mediaType, mediaCaption, mediaFilename } = body

    // Validate: either text, template, or media
    if (!text && !templateName && !mediaUrl && !mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Either text message, template name, or media (URL or ID) is required' },
        { status: 400 }
      )
    }

    // Validate media type if media provided
    if ((mediaUrl || mediaId) && mediaType) {
      const allowedMediaTypes = ['image', 'document', 'video', 'audio']
      if (!allowedMediaTypes.includes(mediaType)) {
        return NextResponse.json(
          { ok: false, error: `Invalid media type. Must be one of: ${allowedMediaTypes.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Get conversation with contact
    // Use select instead of include to avoid loading fields that may not exist yet (infoSharedAt, etc.)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        contactId: true,
        leadId: true,
        channel: true,
        lastInboundAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        lead: {
          select: {
            id: true,
            stage: true,
            serviceTypeId: true,
            nextFollowUpAt: true,
            lastContactAt: true,
            lastContactChannel: true,
            // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
            // These will be available after migration is run
          },
        },
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

    // Check 24-hour messaging window for WhatsApp
    // WhatsApp Business API only allows free-form messages within 24 hours of customer's last message
    // Outside 24 hours, MUST use pre-approved templates
    const now = new Date()
    const lastInboundAt = conversation.lastInboundAt || null
    
    let within24HourWindow = false
    if (lastInboundAt) {
      const hoursSinceLastInbound = (now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
      within24HourWindow = hoursSinceLastInbound <= 24
    } else {
      // If no inbound message, we can send (first message to customer)
      within24HourWindow = true
    }

    // If trying to send free-form text outside 24-hour window, require template instead
    if (text && !templateName && !within24HourWindow) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cannot send free-form message outside 24-hour window',
          hint: 'WhatsApp Business API requires pre-approved templates for messages sent more than 24 hours after the customer\'s last message. Please use a template message instead.',
          requiresTemplate: true,
          hoursSinceLastInbound: lastInboundAt 
            ? Math.round((now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60))
            : null,
        },
        { status: 400 }
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
    let messageContent = text || ''

    try {
      if ((mediaUrl || mediaId) && mediaType) {
        // Send media message (works within 24-hour window)
        if (!within24HourWindow) {
          throw new Error('Media messages can only be sent within 24-hour window. Use templates for outside 24 hours.')
        }
        
        // Use media ID if provided (preferred - from Meta upload), otherwise use URL
        let result
        if (mediaId) {
          result = await sendMediaMessageById(
            normalizedPhone,
            mediaType as 'image' | 'document' | 'video' | 'audio',
            mediaId,
            {
              caption: mediaCaption,
              filename: mediaFilename,
            }
          )
        } else if (mediaUrl) {
          result = await sendMediaMessage(
            normalizedPhone,
            mediaType as 'image' | 'document' | 'video' | 'audio',
            mediaUrl,
            {
              caption: mediaCaption,
              filename: mediaFilename,
            }
          )
        } else {
          throw new Error('Either mediaId or mediaUrl must be provided')
        }
        
        whatsappMessageId = result.messageId
        messageContent = mediaCaption || `[${mediaType}]`
      } else if (templateName) {
        // Send template message (works outside 24-hour window)
        const result = await sendTemplateMessage(
          normalizedPhone,
          templateName,
          'en_US', // Default language, can be made configurable
          templateParams || []
        )
        whatsappMessageId = result.messageId
        messageContent = `Template: ${templateName}`
      } else if (text && within24HourWindow) {
        // Send free-form text message (only within 24-hour window)
        const result = await sendTextMessage(normalizedPhone, text.trim())
        whatsappMessageId = result.messageId
        messageContent = text.trim()
      } else {
        throw new Error('Invalid message type or outside 24-hour window')
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
        type: mediaType || (templateName ? 'template' : 'text'),
        body: messageContent,
        mediaUrl: mediaId || mediaUrl || null, // Store media ID or URL
        mediaMimeType: mediaType ? (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream') : null,
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
      // Phase 2: Detect if info/quotation was shared
      const messageContent = text || mediaCaption || `[${mediaType}]` || ''
      const { detectInfoOrQuotationShared, markInfoShared } = await import('@/lib/automation/infoShared')
      const detection = detectInfoOrQuotationShared(messageContent)
      
      const updateData: any = {
        lastContactAt: sentAt,
        lastContactChannel: 'whatsapp',
      }

      if (detection.isInfoShared && detection.infoType) {
        // Mark info as shared (triggers follow-up automation)
        await markInfoShared(conversation.leadId, detection.infoType)
      }

      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: updateData,
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
