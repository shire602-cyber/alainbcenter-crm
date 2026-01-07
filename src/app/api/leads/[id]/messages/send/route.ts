/**
 * POST /api/leads/[id]/messages/send
 * 
 * Unified endpoint for sending messages via any channel (WhatsApp, Email, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'
import { sendEmailMessage } from '@/lib/emailClient'
import { findOrCreateConversation, buildWhatsAppExternalId } from '@/lib/whatsappInbound'

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

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { channel, body: messageBody, attachmentIds } = body

    if (!channel || !messageBody?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Channel and message body are required' },
        { status: 400 }
      )
    }

    // Validate channel
    const validChannels = ['WHATSAPP', 'EMAIL', 'INSTAGRAM', 'FACEBOOK']
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

    // Map channel names to database format
    const channelMap: Record<string, string> = {
      'WHATSAPP': 'whatsapp',
      'EMAIL': 'email',
      'INSTAGRAM': 'instagram',
      'FACEBOOK': 'facebook',
    }
    const dbChannel = channelMap[normalizedChannel]

    // Validate channel-specific requirements
    if (normalizedChannel === 'WHATSAPP' && !lead.contact.phone) {
      return NextResponse.json(
        { ok: false, error: 'Contact phone number is required for WhatsApp messages' },
        { status: 400 }
      )
    }

    if (normalizedChannel === 'EMAIL' && !lead.contact.email) {
      return NextResponse.json(
        { ok: false, error: 'Contact email address is required for email messages' },
        { status: 400 }
      )
    }

    // Find or create conversation
    let conversation = await findOrCreateConversation(
      prisma,
      lead.id,
      lead.contactId,
      dbChannel
    )

    // Create Message record with PENDING status (will update after send)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: lead.contactId,
        direction: 'OUTBOUND',
        channel: dbChannel,
        type: 'text',
        body: messageBody.trim(),
        status: 'PENDING',
        payload: JSON.stringify({
          attachmentIds: attachmentIds || [],
          sentBy: user.id,
          sentByEmail: user.email,
        }),
        createdByUserId: user.id,
        sentAt: new Date(),
      },
    })

    // Dispatch via channel-specific helper
    let sendResult: { success: boolean; messageId?: string; error?: string }
    let finalStatus = 'SENT'
    let providerMessageId: string | null = null

    try {
      if (normalizedChannel === 'WHATSAPP') {
        const result = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: lead.contactId,
          leadId: lead.id,
          phone: lead.contact.phone!,
          text: messageBody.trim(),
          provider: 'whatsapp',
          triggerProviderMessageId: null, // Manual send
          replyType: 'answer',
          lastQuestionKey: null,
          flowStep: null,
        })

        if (result.wasDuplicate) {
          sendResult = {
            success: false,
            error: 'Duplicate message blocked (idempotency)',
          }
          finalStatus = 'FAILED'
        } else if (result.success && result.messageId) {
          providerMessageId = result.messageId
          finalStatus = 'SENT'
          sendResult = {
            success: true,
            messageId: result.messageId,
          }
          
          // Update conversation externalId if not set and we got a message ID
          if (!conversation.externalId && lead.contact.phone) {
            // Extract phone number ID from integration config if available
            const integration = await prisma.integration.findUnique({
              where: { name: 'whatsapp' },
            })
            
            let phoneNumberId: string | undefined
            if (integration?.config) {
              try {
                const config = typeof integration.config === 'string' 
                  ? JSON.parse(integration.config) 
                  : integration.config
                phoneNumberId = config.phoneNumberId
              } catch {}
            }
            
            const externalId = buildWhatsAppExternalId(phoneNumberId, lead.contact.phone)
            if (externalId) {
              await prisma.conversation.update({
                where: { id: conversation.id },
                data: { externalId },
              })
            }
          }
        } else {
          finalStatus = 'FAILED'
          sendResult = {
            success: false,
            error: result.error || 'Failed to send message',
          }
        }
      } else if (normalizedChannel === 'EMAIL') {
        // Extract subject from body if it contains a subject line
        let subject = `Message from Alain Business Center`
        let emailBody = messageBody.trim()
        
        // Check if body has subject line pattern "Subject: ..."
        const subjectMatch = emailBody.match(/^Subject:\s*(.+)$/mi)
        if (subjectMatch) {
          subject = subjectMatch[1]
          emailBody = emailBody.replace(/^Subject:\s*.+$/mi, '').trim()
        }
        
        sendResult = await sendEmailMessage(lead.contact.email!, subject, emailBody)
        
        if (sendResult.success && sendResult.messageId) {
          providerMessageId = sendResult.messageId
          finalStatus = 'SENT'
        } else {
          finalStatus = 'FAILED'
        }
      } else {
        // Instagram/Facebook - not yet implemented
        sendResult = {
          success: false,
          error: `${normalizedChannel} sending not yet implemented`,
        }
        finalStatus = 'FAILED'
      }

      // Update message with result
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: finalStatus,
          providerMessageId: providerMessageId || undefined,
          payload: JSON.stringify({
            attachmentIds: attachmentIds || [],
            sentBy: user.id,
            sendResult,
            error: sendResult.error,
          }),
          sentAt: new Date(),
        },
      })

      // Create status event
      await prisma.messageStatusEvent.create({
        data: {
          messageId: message.id,
          conversationId: conversation.id,
          status: finalStatus,
          providerStatus: sendResult.messageId || 'pending',
          errorMessage: sendResult.error || null,
          rawPayload: JSON.stringify(sendResult),
        },
      })

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
          unreadCount: 0, // Reset unread since we sent a message
        },
      })

      // Update lead
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastContactAt: new Date(),
          lastOutboundAt: new Date(), // Update lastOutboundAt for forecast
          lastContactChannel: dbChannel,
        },
      })

      // Recompute deal forecast (non-blocking)
      try {
        const { recomputeAndSaveForecast } = await import('@/lib/forecast/dealForecast')
        recomputeAndSaveForecast(lead.id).catch((err) => {
          console.warn(`⚠️ [FORECAST] Failed to recompute forecast:`, err.message)
        })
      } catch (error) {
        // Forecast not critical - continue
      }

      // Create CommunicationLog for backward compatibility
      try {
        await prisma.communicationLog.create({
          data: {
            leadId: lead.id,
            conversationId: conversation.id,
            channel: dbChannel,
            direction: 'outbound',
            body: messageBody.trim(),
            messageSnippet: messageBody.trim().substring(0, 200),
            externalId: providerMessageId || undefined,
            whatsappMessageId: normalizedChannel === 'WHATSAPP' ? providerMessageId || undefined : undefined,
            deliveryStatus: finalStatus.toLowerCase(),
            meta: JSON.stringify(sendResult),
            isRead: true,
          },
        })
      } catch (logError) {
        // CommunicationLog creation is not critical - continue
        console.warn('Failed to create CommunicationLog:', logError)
      }

      return NextResponse.json({
        ok: true,
        message: {
          id: message.id,
          status: finalStatus,
          providerMessageId,
          sentAt: message.sentAt,
        },
      })
    } catch (sendError: any) {
      // Update message with error
      finalStatus = 'FAILED'
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: finalStatus,
          payload: JSON.stringify({
            error: sendError.message,
            // Stack trace not stored for security - only logged server-side
          }),
        },
      })

      // Create failed status event
      await prisma.messageStatusEvent.create({
        data: {
          messageId: message.id,
          conversationId: conversation.id,
          status: 'FAILED',
          errorMessage: sendError.message,
          rawPayload: JSON.stringify({ error: sendError.message }),
        },
      })

      return NextResponse.json(
        {
          ok: false,
          error: sendError.message || 'Failed to send message',
          message: {
            id: message.id,
            status: finalStatus,
          },
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error in send message endpoint:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



