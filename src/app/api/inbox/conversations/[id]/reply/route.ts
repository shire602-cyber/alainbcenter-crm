import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

/**
 * POST /api/inbox/conversations/[id]/reply
 * Sends a reply (WhatsApp or Instagram) and creates outbound message
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

    // Validate contact has phone or Instagram ID
    const channelLower = conversation.channel?.toLowerCase() || 'whatsapp'
    const isInstagram = channelLower === 'instagram'
    const isWhatsApp = channelLower === 'whatsapp'
    
    if (!conversation.contact.phone || !conversation.contact.phone.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Contact does not have a phone number or Instagram ID',
          hint: isInstagram 
            ? 'Please ensure the contact has an Instagram ID before sending messages.'
            : 'Please add a phone number to this contact before sending WhatsApp messages.',
        },
        { status: 400 }
      )
    }

    // Map channel to provider
    const channelToProvider: Record<string, 'whatsapp' | 'email' | 'instagram' | 'facebook'> = {
      'whatsapp': 'whatsapp',
      'instagram': 'instagram',
      'email': 'email',
      'facebook': 'facebook',
    }
    const provider = channelToProvider[channelLower] || 'whatsapp'
    
    // Only support WhatsApp and Instagram for now
    if (!isWhatsApp && !isInstagram) {
      return NextResponse.json(
        {
          ok: false,
          error: `Reply not supported for ${conversation.channel} channel`,
          hint: 'Currently only WhatsApp and Instagram are supported.',
        },
        { status: 400 }
      )
    }

    // Send message with idempotency
    let messageId: string | null = null
    let sendError: any = null
    const sentAt = new Date()
    
    try {
      const result = await sendOutboundWithIdempotency({
        conversationId: conversation.id,
        contactId: conversation.contactId,
        leadId: conversation.leadId,
        phone: conversation.contact.phone,
        text: text.trim(),
        provider, // Use mapped provider (whatsapp or instagram)
        triggerProviderMessageId: null, // Manual send
        replyType: 'answer',
        lastQuestionKey: null,
        flowStep: null,
      })

      if (result.wasDuplicate) {
        console.log(`⚠️ [INBOX-REPLY] Duplicate outbound blocked by idempotency (channel: ${channelLower}, provider: ${provider})`)
        sendError = 'Duplicate message blocked (idempotency)'
      } else if (!result.success) {
        throw new Error(result.error || 'Failed to send message')
      } else {
        messageId = result.messageId || null
        console.log(`✅ [INBOX-REPLY] Message sent successfully (channel: ${channelLower}, provider: ${provider}, messageId: ${messageId})`)
      }
    } catch (sendError_: any) {
      console.error(`❌ [INBOX-REPLY] Send error (channel: ${channelLower}, provider: ${provider}):`, sendError_)
      sendError = sendError_
      // Continue to create message record with FAILED status
    }

    // Create outbound message with new schema fields
    // Check for duplicate first (idempotency)
    let message
    if (messageId) {
      try {
        message = await prisma.message.findFirst({
          where: {
            channel: channelLower,
            providerMessageId: messageId,
          },
        })
        if (message) {
          console.log(`[INBOX-REPLY] Message already exists (idempotency): ${message.id} for providerMessageId ${messageId}`)
          // Return existing message - don't create duplicate
        }
      } catch (findError: any) {
        console.warn('[INBOX-REPLY] Error checking for existing message:', findError)
      }
    }

    if (!message) {
      const messageStatus = messageId ? 'SENT' : 'FAILED'
      try {
        message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            leadId: conversation.leadId,
            contactId: conversation.contactId,
            direction: 'OUTBOUND', // OUTBOUND for outbound
            channel: channelLower, // Use actual channel (whatsapp or instagram)
            type: 'text',
            body: text.trim(),
            providerMessageId: messageId || null, // Store provider message ID
            status: messageStatus,
            sentAt: sentAt,
            createdByUserId: user.id,
            rawPayload: sendError 
              ? JSON.stringify({ error: sendError.message, stack: sendError.stack })
              : null,
          },
        })
      } catch (createError: any) {
        // Handle unique constraint violation (duplicate message)
        if (createError.code === 'P2002' || createError.message?.includes('Unique constraint') || createError.message?.includes('duplicate key')) {
          console.log(`[INBOX-REPLY] Duplicate message detected, fetching existing: providerMessageId=${messageId}`)
          if (messageId) {
            message = await prisma.message.findFirst({
              where: {
                channel: channelLower,
                providerMessageId: messageId,
              },
            })
            if (message) {
              console.log(`[INBOX-REPLY] Found existing message: ${message.id}`)
            } else {
              throw new Error('Duplicate message but existing message not found')
            }
          } else {
            throw createError
          }
        } else {
          throw createError
        }
      }
    }

    // Create initial status event
    if (messageId) {
      try {
        await prisma.messageStatusEvent.create({
          data: {
            messageId: message.id,
            conversationId: conversation.id,
            status: 'SENT',
            providerStatus: 'sent',
            rawPayload: JSON.stringify({ messageId: messageId, provider }),
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
      // Phase 2: Detect if info/quotation was shared
      const { detectInfoOrQuotationShared, markInfoShared } = await import('@/lib/automation/infoShared')
      const detection = detectInfoOrQuotationShared(text)
      
      const updateData: any = {
        lastContactAt: sentAt,
        lastContactChannel: channelLower, // Use actual channel
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
      const channelName = isInstagram ? 'Instagram' : 'WhatsApp'
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to send ${channelName} message`,
          hint: sendError.message || `Check ${channelName} configuration and try again.`,
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
