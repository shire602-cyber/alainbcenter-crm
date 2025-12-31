/**
 * GET /api/ai/debug/conversation
 * Debug endpoint to inspect conversation state, qualification, and last decisions
 * 
 * Bypasses auth for internal debugging (same bypass strategy as cron/webhooks/jobs)
 * OR include safe token auth if needed
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loadConversationState } from '@/lib/ai/stateMachine'

export async function GET(req: NextRequest) {
  try {
    // CRITICAL FIX F: Safe token auth OR bypass for internal use
    // For now, allow without auth for internal debugging (same as cron/webhooks)
    // In production, add token check: const token = req.headers.get('x-debug-token')
    // if (token !== process.env.DEBUG_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const searchParams = req.nextUrl.searchParams
    const conversationIdParam = searchParams.get('conversationId')
    
    if (!conversationIdParam) {
      return NextResponse.json(
        { ok: false, error: 'conversationId query parameter is required' },
        { status: 400 }
      )
    }
    
    const conversationId = parseInt(conversationIdParam)
    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversationId' },
        { status: 400 }
      )
    }
    
    // Load conversation state
    const state = await loadConversationState(conversationId)
    
    // Load conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: {
          include: {
            contact: true,
            serviceType: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 messages
        },
      },
    })
    
    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }
    
    // Get last outbound job
    const lastOutboundJob = await prisma.outboundJob.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    
    // Get last outbound message log
    const lastOutboundLog = await prisma.outboundMessageLog.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    
    return NextResponse.json({
      ok: true,
      conversationId,
      state: {
        qualificationStage: state.qualificationStage,
        questionsAskedCount: state.questionsAskedCount,
        lastQuestionKey: state.lastQuestionKey,
        serviceKey: state.serviceKey,
        knownFields: state.knownFields,
        stateVersion: state.stateVersion,
      },
      conversation: {
        leadId: conversation.leadId,
        contactId: conversation.contactId,
        channel: conversation.channel,
        status: conversation.status,
        lastInboundAt: conversation.lastInboundAt,
        lastOutboundAt: conversation.lastOutboundAt,
        lastMessageAt: conversation.lastMessageAt,
        lastAutoReplyAt: conversation.lastAutoReplyAt,
      },
      lead: conversation.lead ? {
        id: conversation.lead.id,
        serviceType: conversation.lead.serviceType?.name,
        autopilotEnabled: conversation.lead.autopilotEnabled,
        autoReplyEnabled: conversation.lead.autoReplyEnabled,
        aiAgentProfileId: conversation.lead.aiAgentProfileId,
      } : null,
      lastOutboundJob: lastOutboundJob ? {
        id: lastOutboundJob.id,
        status: lastOutboundJob.status,
        idempotencyKey: lastOutboundJob.idempotencyKey,
        inboundProviderMessageId: lastOutboundJob.inboundProviderMessageId,
        createdAt: lastOutboundJob.createdAt,
        completedAt: lastOutboundJob.completedAt,
        error: lastOutboundJob.error,
      } : null,
      lastOutboundLog: lastOutboundLog ? {
        id: lastOutboundLog.id,
        status: lastOutboundLog.status,
        outboundDedupeKey: lastOutboundLog.outboundDedupeKey?.substring(0, 16) + '...',
        replyType: lastOutboundLog.replyType,
        lastQuestionKey: lastOutboundLog.lastQuestionKey,
        sentAt: lastOutboundLog.sentAt,
      } : null,
      recentMessages: conversation.messages.map(m => ({
        id: m.id,
        direction: m.direction,
        body: m.body?.substring(0, 100),
        createdAt: m.createdAt,
        providerMessageId: m.providerMessageId,
      })),
    })
  } catch (error: any) {
    console.error('[DEBUG] Error in conversation debug endpoint:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch debug info' },
      { status: 500 }
    )
  }
}

