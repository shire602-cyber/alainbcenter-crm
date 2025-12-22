import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/inbox/conversations/[id]/assign
 * Assigns conversation to a user
 * Body: { userId: number | null } (null to unassign)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { userId } = body

    // Validate userId if provided
    if (userId !== null && userId !== undefined) {
      const assignee = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
      })

      if (!assignee) {
        return NextResponse.json(
          { ok: false, error: 'User not found' },
          { status: 404 }
        )
      }
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

    // Update assignment
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        assignedUserId: userId === null || userId === undefined ? null : parseInt(userId),
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      conversation: {
        id: updated.id,
        assignedUser: updated.assignedUser,
      },
    })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/assign error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to assign conversation' },
      { status: error.statusCode || 500 }
    )
  }
}


















