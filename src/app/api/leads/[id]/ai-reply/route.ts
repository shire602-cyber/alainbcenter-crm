import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { generateAIReply } from '@/lib/ai/orchestrator'
import { upsertConversation } from '@/lib/conversation/upsert'
import { getExternalThreadId } from '@/lib/conversation/getExternalThreadId'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    // Resolve params (Next.js 15+ can have Promise params)
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        serviceType: true,
        communicationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 messages for context
        },
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Find or create conversation
    const { id: conversationId } = await upsertConversation({
      contactId: lead.contactId,
      channel: 'whatsapp',
      leadId: lead.id,
      externalThreadId: getExternalThreadId('whatsapp', lead.contact),
    })
    
    // Get latest inbound message or create dummy
    const latestMessage = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
    })
    
    const inboundText = latestMessage?.body || lead.communicationLogs[0]?.messageSnippet || 'Follow-up'
    const inboundMessageId = latestMessage?.id || 0
    
    // Call orchestrator
    const result = await generateAIReply({
      conversationId,
      leadId: lead.id,
      contactId: lead.contactId,
      inboundText,
      inboundMessageId,
      channel: 'whatsapp',
      language: 'en',
    })

    return NextResponse.json({
      reply: result.replyText, // Client expects 'reply' field
      nextFollowUp: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days
      suggestedDocs: [], // TODO: Extract from orchestrator result
    })
  } catch (error: any) {
    console.error('AI reply generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate AI reply' },
      { status: error.statusCode || 500 }
    )
  }
}
