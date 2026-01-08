import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/inbox/conversations/[id]/read
 * Marks conversation as read (sets unreadCount to 0)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    // Use select to avoid missing columns (lastProcessedInboundMessageId, etc.)
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          contactId: true,
          leadId: true,
          channel: true,
          status: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          unreadCount: true,
          priorityScore: true,
          createdAt: true,
          updatedAt: true,
          aiState: true,
          aiLockUntil: true,
          lastAiOutboundAt: true,
          ruleEngineMemory: true,
          deletedAt: true,
        },
      }) as any
    } catch (error: any) {
      // Gracefully handle missing lastProcessedInboundMessageId column
      if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
        conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            contactId: true,
            leadId: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            unreadCount: true,
            priorityScore: true,
            createdAt: true,
            updatedAt: true,
            aiState: true,
            aiLockUntil: true,
            lastAiOutboundAt: true,
            ruleEngineMemory: true,
            deletedAt: true,
          },
        }) as any
      } else {
        throw error
      }
    }

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Mark as read
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        unreadCount: 0,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/read error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to mark as read' },
      { status: error.statusCode || 500 }
    )
  }
}


















