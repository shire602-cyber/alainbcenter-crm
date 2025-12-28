/**
 * POST /api/admin/conversations/[id]/simulate-retry
 * 
 * Simulate a webhook retry to test idempotency
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    
    const { id } = await params
    const conversationId = parseInt(id, 10)
    
    if (isNaN(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
    }
    
    // Get the last inbound message for this conversation
    const lastInbound = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          include: {
            contact: true,
            lead: true,
          },
        },
      },
    })
    
    if (!lastInbound) {
      return NextResponse.json({ error: 'No inbound message found' }, { status: 404 })
    }
    
    // Simulate retry by calling the webhook handler logic
    // This will test idempotency
    const { handleInboundMessageAutoMatch } = await import('@/lib/inbound/autoMatchPipeline')
    
    const result = await handleInboundMessageAutoMatch({
      channel: lastInbound.channel.toUpperCase() as any,
      providerMessageId: lastInbound.providerMessageId || `retry_${Date.now()}`,
      fromPhone: lastInbound.conversation.contact.phone,
      fromName: lastInbound.conversation.contact.fullName,
      text: lastInbound.body || '',
      timestamp: lastInbound.createdAt,
      metadata: {
        externalId: lastInbound.providerMessageId || '',
        rawPayload: {},
        isRetry: true,
      },
    })
    
    return NextResponse.json({
      success: true,
      message: 'Webhook retry simulated',
      result: {
        conversationId: result.conversation?.id,
        leadId: result.lead?.id,
        contactId: result.contact?.id,
        wasDuplicate: result.wasDuplicate,
      },
    })
  } catch (error: any) {
    console.error('Error simulating webhook retry:', error)
    
    // If it's a duplicate error, that's expected - return success
    if (error.message?.includes('DUPLICATE') || error.message?.includes('duplicate')) {
      return NextResponse.json({
        success: true,
        message: 'Duplicate detected (expected)',
        wasDuplicate: true,
      })
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

