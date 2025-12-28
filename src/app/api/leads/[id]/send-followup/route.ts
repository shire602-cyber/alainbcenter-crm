import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'
import { generateAIReply } from '@/lib/ai/orchestrator'
import { upsertConversation } from '@/lib/conversation/upsert'
import { getExternalThreadId } from '@/lib/conversation/getExternalThreadId'

/**
 * POST /api/leads/[id]/send-followup
 * Send an immediate follow-up message to the lead
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
    const { id } = await params
    const leadId = parseInt(id)
    
    // Check if within support hours (7am - 9:30pm Dubai time)
    const now = new Date()
    const hour = now.getUTCHours()
    const minute = now.getUTCMinutes()
    // Dubai is UTC+4, so 7:00-21:30 Dubai = 3:00-17:30 UTC
    const dubaiHour = (hour + 4) % 24
    const dubaiMinute = minute
    const dubaiTime = dubaiHour * 60 + dubaiMinute // Total minutes since midnight
    const startTime = 7 * 60 // 7:00 AM = 420 minutes
    const endTime = 21 * 60 + 30 // 9:30 PM = 1290 minutes
    
    const isWithinHours = dubaiTime >= startTime && dubaiTime < endTime
    
    if (!isWithinHours) {
      return NextResponse.json(
        { 
          error: `Outside support hours. Follow-ups can only be sent between 7am-9:30pm Dubai time. Current time: ${dubaiHour}:${dubaiMinute.toString().padStart(2, '0')} Dubai time.` 
        },
        { status: 400 }
      )
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!lead || !lead.contact) {
      return NextResponse.json(
        { error: 'Lead or contact not found' },
        { status: 404 }
      )
    }

    if (!lead.contact.phone) {
      return NextResponse.json(
        { error: 'Contact has no phone number' },
        { status: 400 }
      )
    }

    // Find or create conversation
    const { id: conversationId } = await upsertConversation({
      contactId: lead.contactId,
      channel: 'whatsapp',
      leadId: lead.id,
      externalThreadId: getExternalThreadId('whatsapp', lead.contact),
    })
    
    // Get latest inbound message or use dummy
    const latestMessage = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
    })
    
    const inboundText = latestMessage?.body || lead.messages[0]?.body || 'Follow-up'
    const inboundMessageId = latestMessage?.id || 0
    
    // Generate AI follow-up message using orchestrator
    const orchestratorResult = await generateAIReply({
      conversationId,
      leadId: lead.id,
      contactId: lead.contactId,
      inboundText,
      inboundMessageId,
      channel: 'whatsapp',
      language: 'en',
    })

    if (!orchestratorResult.replyText || orchestratorResult.replyText.trim().length === 0) {
      return NextResponse.json(
        { error: orchestratorResult.handoverReason || 'Failed to generate follow-up message' },
        { status: 500 }
      )
    }
    
    const aiResult = {
      success: true,
      text: orchestratorResult.replyText,
    }

    // Send message with idempotency
    const result = await sendOutboundWithIdempotency({
      conversationId: conversationId,
      contactId: lead.contactId,
      leadId: lead.id,
      phone: lead.contact.phone,
      text: aiResult.text,
      provider: 'whatsapp',
      triggerProviderMessageId: latestMessage?.providerMessageId || null,
      replyType: 'followup',
      lastQuestionKey: null,
      flowStep: null,
    })

    if (result.wasDuplicate) {
      return NextResponse.json(
        { error: 'Duplicate message blocked (idempotency)' },
        { status: 409 }
      )
    }

    if (!result.success || !result.messageId) {
      return NextResponse.json(
        { error: result.error || 'Failed to send message' },
        { status: 500 }
      )
    }

    // Create message record (if not already created by idempotency system)
    try {
      await prisma.message.create({
        data: {
          conversationId: conversationId,
          leadId: lead.id,
          contactId: lead.contact.id,
          direction: 'OUTBOUND',
          channel: 'whatsapp',
          type: 'text',
          body: aiResult.text,
          status: 'SENT',
          providerMessageId: result.messageId,
          rawPayload: JSON.stringify({
            manualFollowUp: true,
            aiGenerated: true,
          }),
          sentAt: new Date(),
        },
      })
    } catch (msgError: any) {
      // Non-critical - message may already exist
      if (!msgError.message?.includes('Unique constraint')) {
        console.warn(`⚠️ [SEND-FOLLOWUP] Failed to create Message record:`, msgError.message)
      }
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
      },
    })

    return NextResponse.json({ 
      ok: true, 
      message: 'Follow-up sent successfully',
      messageId: result.messageId,
      outboundLogId: result.outboundLogId,
    })
  } catch (error: any) {
    console.error('Send follow-up error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

