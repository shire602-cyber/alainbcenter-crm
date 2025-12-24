import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'
import { generateAIAutoresponse } from '@/lib/aiMessaging'

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

    // Generate AI follow-up message
    const aiResult = await generateAIAutoresponse({
      lead,
      contact: lead.contact,
      recentMessages: lead.messages.map(m => ({
        direction: m.direction,
        body: m.body || '',
        createdAt: m.createdAt,
      })),
      mode: 'FOLLOW_UP',
      channel: 'WHATSAPP',
    })

    if (!aiResult.success || !aiResult.text) {
      return NextResponse.json(
        { error: aiResult.error || 'Failed to generate follow-up message' },
        { status: 500 }
      )
    }

    // Send message
    const result = await sendTextMessage(lead.contact.phone, aiResult.text)

    if (!result || !result.messageId) {
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      )
    }

    // Create message record
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId: lead.contact.id,
        leadId: lead.id,
        channel: 'whatsapp',
      },
    })

    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
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

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
        },
      })
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Follow-up sent successfully',
      messageId: result.messageId,
    })
  } catch (error: any) {
    console.error('Send follow-up error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

