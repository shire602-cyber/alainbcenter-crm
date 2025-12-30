import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/leads/[id]/conversation-debug
 * Returns diagnostic information for conversation debugging (admin only)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    
    const { id } = await params
    const leadId = parseInt(id)
    
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }
    
    // Get lead with conversations
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        conversations: {
          orderBy: { lastMessageAt: 'desc' },
          take: 1, // Get most recent conversation
        },
      },
    })
    
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    
    const conversation = lead.conversations[0] || null
    
    // Parse knownFields
    let knownFields: Record<string, any> = {}
    try {
      if (conversation?.knownFields) {
        knownFields = JSON.parse(conversation.knownFields)
      }
    } catch {
      knownFields = {}
    }
    
    // Get last 5 outbound messages with dedupe info
    const last5Outbound = conversation
      ? await prisma.message.findMany({
          where: {
            conversationId: conversation.id,
            direction: 'OUTBOUND',
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            body: true,
            createdAt: true,
            payload: true,
          },
        })
      : []
    
    // Extract dedupe keys from payload
    const last5OutboundDedupes = last5Outbound.map((msg) => {
      let dedupeKey = 'unknown'
      try {
        if (msg.payload) {
          const payload = JSON.parse(msg.payload)
          dedupeKey = payload.dedupeKey || payload.replyKey || 'unknown'
        }
      } catch {
        dedupeKey = 'unknown'
      }
      
      return {
        dedupeKey,
        timestamp: msg.createdAt.toISOString(),
        messageId: msg.id,
        body: msg.body || '',
      }
    })
    
    return NextResponse.json({
      conversationId: conversation?.id || null,
      externalThreadId: conversation?.externalThreadId || null,
      stateVersion: conversation?.stateVersion || 0,
      qualificationStage: conversation?.qualificationStage || null,
      questionsAskedCount: conversation?.questionsAskedCount || 0,
      lastQuestionKey: conversation?.lastQuestionKey || null,
      knownFields,
      last5OutboundDedupes,
      leadFields: {
        serviceTypeEnum: lead.serviceTypeEnum,
        serviceTypeId: lead.serviceTypeId,
        requestedServiceRaw: lead.requestedServiceRaw,
        nationality: lead.contact.nationality,
      },
    })
  } catch (error: any) {
    console.error('Conversation debug error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load debug data' },
      { status: 500 }
    )
  }
}


