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

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

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

















