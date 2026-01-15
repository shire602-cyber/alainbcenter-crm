import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from '@/lib/whatsapp'
import { sendMediaMessageById } from '@/lib/whatsapp-media-upload'
import { MEDIA_TYPES } from '@/lib/media/extractMediaId'

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
    const { text, templateName, templateParams, mediaUrl, mediaId, mediaType, mediaCaption, mediaFilename, mediaMimeType, mediaSize, clientMessageId } = body

    // Validate: either text, template, or media
    if (!text && !templateName && !mediaUrl && !mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Either text message, template name, or media (URL or ID) is required' },
        { status: 400 }
      )
    }

    // Validate media type if media provided
    if ((mediaUrl || mediaId) && mediaType) {
      if (!MEDIA_TYPES.has(mediaType)) {
        return NextResponse.json(
          { ok: false, error: `Invalid media type. Must be one of: ${Array.from(MEDIA_TYPES).join(', ')}` },
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

    // Map channel to provider and check support
    const channelLower = conversation.channel?.toLowerCase() || 'whatsapp'
    const isInstagram = channelLower === 'instagram'
    const isWhatsApp = channelLower === 'whatsapp'
    
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

    // For Instagram: Only text messages are supported (no templates/media via this route)
    if (isInstagram && (templateName || mediaUrl || mediaId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instagram only supports text messages via this route',
          hint: 'Templates and media are not supported for Instagram through this endpoint.',
        },
        { status: 400 }
      )
    }

    // Check 24-hour messaging window for WhatsApp (Instagram doesn't have this restriction)
    // WhatsApp Business API only allows free-form messages within 24 hours of customer's last message
    // Outside 24 hours, MUST use pre-approved templates
    const now = new Date()
    const lastInboundAt = conversation.lastInboundAt || null
    
    let within24HourWindow = false
    if (isWhatsApp) {
      if (lastInboundAt) {
        const hoursSinceLastInbound = (now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
        within24HourWindow = hoursSinceLastInbound <= 24
      } else {
        // If no inbound message, we can send (first message to customer)
        within24HourWindow = true
      }
    } else {
      // Instagram doesn't have 24-hour window restriction
      within24HourWindow = true
    }

    // If trying to send free-form text outside 24-hour window (WhatsApp only), require template instead
    if (isWhatsApp && text && !templateName && !within24HourWindow) {
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

    // Normalize phone number (ensure E.164 format for WhatsApp, keep as-is for Instagram)
    let normalizedPhone = conversation.contact.phone
    if (isWhatsApp && !normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone.replace(/^\+/, '')
    }
    // For Instagram, phone is stored as 'ig:USER_ID', which is already correct

    // Map channel to provider
    const channelToProvider: Record<string, 'whatsapp' | 'email' | 'instagram' | 'facebook'> = {
      'whatsapp': 'whatsapp',
      'instagram': 'instagram',
      'email': 'email',
      'facebook': 'facebook',
    }
    const provider = channelToProvider[channelLower] || 'whatsapp'
    
    // SAFETY CHECK: Never use WhatsApp for Instagram conversations
    if (isInstagram && provider !== 'instagram') {
      console.error(`[INBOX-MESSAGES] SAFETY CHECK FAILED: Instagram conversation mapped to ${provider} instead of instagram`, {
        conversationId: conversation.id,
        channel: conversation.channel,
        channelLower,
        provider,
      })
      return NextResponse.json(
        {
          ok: false,
          error: 'Internal error: Instagram conversation incorrectly routed',
          hint: 'Please contact support. This should never happen.',
        },
        { status: 500 }
      )
    }

    // Send message via appropriate provider
    const sentAt = new Date()
    let messageId: string | null = null
    let sendError: any = null
    let messageContent = text || ''

    // For Instagram: Use sendOutboundWithIdempotency directly (simpler, no 24-hour window)
    if (isInstagram && text) {
      try {
        const { sendOutboundWithIdempotency } = await import('@/lib/outbound/sendWithIdempotency')
        const result = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          leadId: conversation.leadId,
          phone: normalizedPhone, // 'ig:USER_ID' format
          text: text.trim(),
          provider: 'instagram',
          triggerProviderMessageId: null, // Manual send
          clientMessageId,
          replyType: 'answer',
          lastQuestionKey: null,
          flowStep: null,
        })

        if (result.error === 'OUTSIDE_ALLOWED_WINDOW') {
          return NextResponse.json(
            {
              ok: false,
              code: 'OUTSIDE_ALLOWED_WINDOW',
              error: 'Instagram messaging window closed',
              hint: 'Instagram allows replies within 24 hours of the last inbound message.',
            },
            { status: 400 }
          )
        }
        if (result.wasDuplicate) {
          console.log(`⚠️ [INBOX-MESSAGES] Duplicate Instagram outbound blocked by idempotency`)
          return NextResponse.json({
            ok: true,
            wasDuplicate: true,
            message: 'Message already sent (duplicate detected)',
          })
        } else if (!result.success) {
          throw new Error(result.error || 'Failed to send Instagram message')
        }

        messageId = result.messageId || null
        messageContent = text.trim()
        
        console.log(`✅ [INBOX-MESSAGES] Instagram message sent successfully (messageId: ${messageId})`)
        
        // sendOutboundWithIdempotency already created the Message record, so find it
        let message = null
        if (messageId) {
          message = await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              providerMessageId: messageId,
              channel: 'instagram',
            },
            orderBy: { createdAt: 'desc' },
          })
        }
        
        if (!message) {
          console.warn(`[INBOX-MESSAGES] Instagram message not found after sendOutboundWithIdempotency: conversationId=${conversation.id}, providerMessageId=${messageId}`)
        }
        
        // Update conversation
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastOutboundAt: sentAt,
            unreadCount: 0,
          },
        })
        
        // Update lead lastContactAt
        if (conversation.leadId) {
          const { detectInfoOrQuotationShared, markInfoShared } = await import('@/lib/automation/infoShared')
          const detection = detectInfoOrQuotationShared(messageContent)
          
          const updateData: any = {
            lastContactAt: sentAt,
            lastContactChannel: 'instagram',
          }

          if (detection.isInfoShared && detection.infoType) {
            await markInfoShared(conversation.leadId, detection.infoType)
          }

          await prisma.lead.update({
            where: { id: conversation.leadId },
            data: updateData,
          })
        }
        
        // Return success - message was created by sendOutboundWithIdempotency
        return NextResponse.json({
          ok: true,
          message: message ? {
            id: message.id,
            direction: message.direction,
            body: message.body,
            status: message.status,
            providerMessageId: message.providerMessageId,
            createdAt: message.createdAt.toISOString(),
          } : {
            id: 0, // Placeholder if not found
            direction: 'OUTBOUND',
            body: messageContent,
            status: 'SENT',
            providerMessageId: messageId,
            createdAt: sentAt.toISOString(),
          },
        })
      } catch (error: any) {
        console.error('Instagram send error:', error)
        // CRITICAL: Return immediately with Instagram error - do NOT fall through to WhatsApp
        return NextResponse.json(
          {
            ok: false,
            error: 'Failed to send Instagram message',
            hint: error.message || 'Check Instagram/Meta connection configuration and try again.',
          },
          { status: 400 }
        )
      }
    }

    // For WhatsApp ONLY: Continue with existing logic (templates, media, 24-hour window)
    // CRITICAL: This block must NOT run for Instagram - Instagram is handled above
    if (isWhatsApp) {
    try {
      if ((mediaUrl || mediaId) && mediaType) {
        // Send media message (works within 24-hour window)
        if (!within24HourWindow) {
          throw new Error('Media messages can only be sent within 24-hour window. Use templates for outside 24 hours.')
        }
        
        // Use media ID if provided (preferred - from Meta upload), otherwise use URL
        let result
        if (mediaId) {
          // Filter out 'sticker' as it's not supported for sending
          if (mediaType === 'sticker') {
            return NextResponse.json(
              { error: 'Stickers cannot be sent via API' },
              { status: 400 }
            )
          }
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
          // Filter out 'sticker' as it's not supported for sending
          if (mediaType === 'sticker') {
            return NextResponse.json(
              { error: 'Stickers cannot be sent via API' },
              { status: 400 }
            )
          }
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
        
        messageId = result.messageId
        messageContent = mediaCaption || `[${mediaType}]`
      } else if (templateName) {
        // Send template message (works outside 24-hour window) - WhatsApp only
        const result = await sendTemplateMessage(
          normalizedPhone,
          templateName,
          'en_US', // Default language, can be made configurable
          templateParams || []
        )
        messageId = result.messageId
        messageContent = `Template: ${templateName}`
      } else if (text && within24HourWindow) {
        // Send free-form text message (only within 24-hour window) with idempotency
        // NOTE: sendOutboundWithIdempotency already creates a Message record, so we don't create another one
        const { sendOutboundWithIdempotency } = await import('@/lib/outbound/sendWithIdempotency')
        const result = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          leadId: conversation.leadId,
          phone: normalizedPhone,
          text: text.trim(),
          provider: 'whatsapp',
          triggerProviderMessageId: null, // Manual send
          clientMessageId,
          replyType: 'answer',
          lastQuestionKey: null,
          flowStep: null,
        })

        if (result.wasDuplicate) {
          console.log(`⚠️ [INBOX-MESSAGES] Duplicate WhatsApp outbound blocked by idempotency`)
          return NextResponse.json({
            ok: true,
            wasDuplicate: true,
            message: 'Message already sent (duplicate detected)',
          })
        } else if (!result.success) {
          throw new Error(result.error || 'Failed to send message')
        }

        messageId = result.messageId || null
        messageContent = text.trim()
        
        // sendOutboundWithIdempotency already created the Message record, so find it
        // Note: sendOutboundWithIdempotency uses uppercase channel ('WHATSAPP'), but we search case-insensitively
        let message = null
        if (messageId) {
          // Try to find the message created by sendOutboundWithIdempotency
          // It uses uppercase 'WHATSAPP', but the unique constraint is case-insensitive (LOWER(channel))
          message = await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              providerMessageId: messageId,
              // Channel can be 'WHATSAPP' (from sendOutboundWithIdempotency) or 'whatsapp' (normalized)
              // The unique index uses LOWER(channel), so both match
            },
            orderBy: { createdAt: 'desc' },
          })
        }
        
        // If message not found (shouldn't happen, but handle gracefully)
        // sendOutboundWithIdempotency should have created it, so if it's missing, log a warning
        // but don't create a duplicate - the send succeeded, so we'll proceed with updates
        if (!message) {
          console.warn(`[INBOX-MESSAGES] WhatsApp message not found after sendOutboundWithIdempotency: conversationId=${conversation.id}, providerMessageId=${messageId}`)
        }
        
        // Update conversation (sendOutboundWithIdempotency already did this, but ensure it's done)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastOutboundAt: sentAt,
            unreadCount: 0,
          },
        })
        
        // Update lead lastContactAt
        if (conversation.leadId) {
          const { detectInfoOrQuotationShared, markInfoShared } = await import('@/lib/automation/infoShared')
          const detection = detectInfoOrQuotationShared(messageContent)
          
          const updateData: any = {
            lastContactAt: sentAt,
            lastContactChannel: channelLower,
          }

          if (detection.isInfoShared && detection.infoType) {
            await markInfoShared(conversation.leadId, detection.infoType)
          }

          await prisma.lead.update({
            where: { id: conversation.leadId },
            data: updateData,
          })
        }
        
        // Return success - message was created by sendOutboundWithIdempotency
        return NextResponse.json({
          ok: true,
          message: message ? {
            id: message.id,
            direction: message.direction,
            body: message.body,
            status: message.status,
            providerMessageId: message.providerMessageId,
            createdAt: message.createdAt.toISOString(),
          } : {
            id: 0, // Placeholder if not found
            direction: 'OUTBOUND',
            body: messageContent,
            status: 'SENT',
            providerMessageId: messageId,
            createdAt: sentAt.toISOString(),
          },
        })
      } else {
        throw new Error('Invalid message type or outside 24-hour window')
      }
    } catch (error: any) {
      console.error(`❌ [INBOX-MESSAGES] Send error (channel: ${channelLower}, provider: ${provider}):`, error)
      sendError = error
      // Continue to create message record with FAILED status (only for template/media, not text)
    }
    } // End of if (isWhatsApp)

    // Create outbound Message(OUT) record (only for template/media messages, not text)
    // Text messages are handled above via sendOutboundWithIdempotency
    const messageStatus = messageId ? 'SENT' : 'FAILED'
    
    // FIX #1, #8: Validate and store providerMediaId (mediaId from request - this is the providerMediaId)
    let providerMediaId: string | null = null
    if (mediaId && typeof mediaId === 'string') {
      const sanitized = mediaId.trim()
      // Validate format: non-empty, reasonable length, no spaces
      if (sanitized.length > 0 && sanitized.length < 500 && !sanitized.includes(' ')) {
        providerMediaId = sanitized
      }
    }
    
    // Ensure mediaType is in MEDIA_TYPES (validation)
    const validatedMediaType = mediaType && MEDIA_TYPES.has(mediaType) ? mediaType : null
    
    // FIX #6: Use actual MIME type from request if available, otherwise infer from mediaType
    let actualMimeType: string | null = null
    if (mediaMimeType && typeof mediaMimeType === 'string') {
      actualMimeType = mediaMimeType.trim()
    } else if (mediaType) {
      // Fallback to inferred MIME type
      actualMimeType = mediaType === 'image' ? 'image/jpeg' 
        : mediaType === 'video' ? 'video/mp4' 
        : mediaType === 'audio' ? 'audio/ogg' 
        : 'application/octet-stream'
    }
    
    // FIX #7: Parse mediaSize if provided (can be number or string)
    let parsedMediaSize: number | null = null
    if (mediaSize !== undefined && mediaSize !== null) {
      if (typeof mediaSize === 'number' && mediaSize > 0) {
        parsedMediaSize = mediaSize
      } else if (typeof mediaSize === 'string') {
        const parsed = parseInt(mediaSize)
        if (!isNaN(parsed) && parsed > 0) {
          parsedMediaSize = parsed
        }
      }
    }
    
    // CRITICAL: Store type in MEDIA_TYPES (validatedMediaType) for media messages
    const messageType = validatedMediaType || (templateName ? 'template' : 'text')
    
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: conversation.leadId,
        contactId: conversation.contactId,
        direction: 'OUTBOUND', // Direction: OUTBOUND for outbound
        channel: channelLower, // Use actual channel
        type: messageType, // CRITICAL: Use validatedMediaType (in MEDIA_TYPES) for media messages
        body: messageContent,
        // CRITICAL: Store providerMediaId (Meta media ID from upload/send) for media proxy retrieval
        providerMediaId: providerMediaId || null,
        mediaUrl: mediaId || mediaUrl || null, // Backward compatibility
        // Store media metadata
        mediaMimeType: actualMimeType,
        mediaFilename: mediaFilename || null,
        mediaSize: parsedMediaSize,
        // Note: mediaCaption is not in schema - captions can be stored in body or payload
        providerMessageId: messageId || null,
        status: messageStatus,
        sentAt: sentAt,
        createdByUserId: user.id,
        rawPayload: sendError
          ? JSON.stringify({ error: sendError.message })
          : null,
      } as any, // Type assertion needed for fields that may not be in Prisma types
    })

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
        lastContactChannel: channelLower,
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
