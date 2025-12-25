import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/inbox/conversations/[id]/assign
 * Assign a conversation to a user or AI
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    const { id } = await params
    const conversationId = parseInt(id)
    const body = await req.json()
    const { assignedUserId, assignedToAI } = body

    // Get conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // If assigning to AI, set assignedUserId to null
    // null assignedUserId = AI assignment
    let finalAssignedUserId: number | null = null

    if (assignedToAI === true) {
      // Explicitly assign to AI (null = AI)
      finalAssignedUserId = null
      console.log(`🤖 Assigning conversation ${conversationId} to AI`)
    } else if (assignedUserId) {
      // Verify user exists and check permissions
      // Allow ADMIN and MANAGER to assign to anyone, regular users can only assign to themselves
      if (!currentUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }
      if (currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER' && assignedUserId !== currentUser.id) {
        return NextResponse.json(
          { error: 'You can only assign to yourself or AI' },
          { status: 403 }
        )
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: assignedUserId },
      })

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      finalAssignedUserId = assignedUserId
      console.log(`👤 Assigning conversation ${conversationId} to user ${targetUser.name} (${targetUser.id})`)
    } else {
      // Unassign (also sets to AI by default)
      finalAssignedUserId = null
      console.log(`🔄 Unassigning conversation ${conversationId} (defaults to AI)`)
    }

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        assignedUserId: finalAssignedUserId,
      },
    })

    return NextResponse.json({
      ok: true,
      message: assignedToAI 
        ? 'Conversation assigned to AI' 
        : finalAssignedUserId 
          ? 'Conversation assigned successfully' 
          : 'Conversation unassigned',
    })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/assign error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign conversation' },
      { status: 500 }
    )
  }
}
