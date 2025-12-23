import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/leads/[id]/send-message
 * Unified endpoint for sending messages via any channel (WhatsApp, Email, FB, IG)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { channel, text, templateKey, attachments } = body

    if (!channel || !text?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Channel and text are required' },
        { status: 400 }
      )
    }

    // Validate channel
    const validChannels = ['WHATSAPP', 'EMAIL', 'FB', 'IG', 'INSTAGRAM']
    const normalizedChannel = channel.toUpperCase()
    if (!validChannels.includes(normalizedChannel)) {
      return NextResponse.json(
        { ok: false, error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
        { status: 400 }
      )
    }

    // Get lead with contact
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Map channel names
    const channelMap: Record<string, string> = {
      'WHATSAPP': 'whatsapp',
      'EMAIL': 'email',
      'FB': 'facebook',
      'IG': 'instagram',
      'INSTAGRAM': 'instagram',
    }
    const dbChannel = channelMap[normalizedChannel]

    // Find or create conversation
    let conversation = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: lead.contactId,
          channel: dbChannel,
        },
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: lead.contactId,
          leadId: lead.id,
          channel: dbChannel,
          status: 'open',
        },
      })
    }

    // Send message based on channel
    let messageId: string | null = null
    let sendResult: any = null
    let sendError: string | null = null

    try {
      if (normalizedChannel === 'WHATSAPP') {
        // Use existing WhatsApp integration
        const integration = await prisma.integration.findUnique({
          where: { name: 'whatsapp' },
        })

        if (!integration || !integration.isEnabled) {
          sendError = 'WhatsApp integration is not enabled'
        } else {
          let config: any = {}
          try {
            config = integration.config ? JSON.parse(integration.config) : {}
          } catch {}

          const accessToken = config.accessToken || integration.accessToken || integration.apiKey
          const phoneNumberId = config.phoneNumberId

          if (!accessToken || !phoneNumberId) {
            sendError = 'WhatsApp credentials not configured'
          } else {
            const toPhone = lead.contact.phone
            const apiUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: toPhone,
                type: 'text',
                text: {
                  body: text.trim(),
                },
              }),
            })

            sendResult = await response.json()
            if (response.ok) {
              messageId = sendResult.messages?.[0]?.id || null
            } else {
              sendError = sendResult.error?.message || 'Failed to send WhatsApp message'
            }
          }
        }
      } else if (normalizedChannel === 'INSTAGRAM' || normalizedChannel === 'IG') {
        // Use Instagram Messaging API
        const integration = await prisma.integration.findUnique({
          where: { name: 'instagram-messaging' },
        })

        if (!integration || !integration.isEnabled) {
          sendError = 'Instagram Messaging integration is not enabled'
        } else {
          let config: any = {}
          try {
            config = integration.config ? JSON.parse(integration.config) : {}
          } catch {}

          const accessToken = config.accessToken || integration.accessToken || integration.apiKey
          const pageId = config.pageId || config.instagramPageId

          if (!accessToken || !pageId) {
            sendError = 'Instagram credentials not configured'
          } else {
            // Get Instagram user ID from conversation or contact
            const instagramUserId = conversation.externalThreadId || lead.contact.phone

            const apiUrl = `https://graph.facebook.com/v20.0/${pageId}/messages`
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                recipient: {
                  id: instagramUserId,
                },
                message: {
                  text: text.trim(),
                },
              }),
            })

            sendResult = await response.json()
            if (response.ok) {
              messageId = sendResult.message_id || null
            } else {
              sendError = sendResult.error?.message || 'Failed to send Instagram message'
            }
          }
        }
      } else if (normalizedChannel === 'EMAIL') {
        // Email sending (stub for now - integrate SMTP later)
        sendError = 'Email sending not yet implemented'
      } else if (normalizedChannel === 'FB') {
        // Facebook Messenger (stub for now)
        sendError = 'Facebook Messenger sending not yet implemented'
      }
    } catch (error: any) {
      sendError = error.message || 'Failed to send message'
      console.error(`Error sending ${normalizedChannel} message:`, error)
    }

    // Always create Message record (even if sending failed)
    const messageStatus = sendError ? 'failed' : (messageId ? 'sent' : 'draft')
    
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: lead.contactId,
        direction: 'outbound',
        channel: dbChannel,
        body: text.trim(),
        status: messageStatus,
        createdByUserId: user.id,
        meta: JSON.stringify({
          externalId: messageId,
          templateKey,
          attachments,
          sendResult,
          error: sendError,
        }),
      },
    })

    // Create CommunicationLog
    await prisma.communicationLog.create({
      data: {
        leadId: lead.id,
        conversationId: conversation.id,
        channel: dbChannel,
        direction: 'outbound',
        body: text.trim(),
        messageSnippet: text.trim().substring(0, 200),
        externalId: messageId,
        deliveryStatus: messageStatus,
        meta: JSON.stringify(sendResult),
        isRead: true,
      },
    })

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    })

    // Phase 2: Detect if info/quotation was shared
    const { detectInfoOrQuotationShared, markInfoShared } = await import('@/lib/automation/infoShared')
    const detection = detectInfoOrQuotationShared(text)
    
    if (detection.isInfoShared && detection.infoType) {
      // Mark info as shared (triggers follow-up automation)
      await markInfoShared(lead.id, detection.infoType)
    }

    // Update lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: new Date(),
        lastContactChannel: dbChannel,
      },
    })

    if (sendError) {
      return NextResponse.json({
        ok: false,
        error: sendError,
        messageId: message.id,
        message: 'Message saved as draft due to sending error',
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      messageId: message.id,
      externalMessageId: messageId,
      message: 'Message sent successfully',
    })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/send-message error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to send message' },
      { status: error.statusCode || 500 }
    )
  }
}
