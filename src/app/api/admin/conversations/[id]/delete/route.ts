/**
 * DELETE /api/admin/conversations/[id]/delete
 * 
 * Admin-only endpoint to soft-delete a conversation
 * Sets deletedAt timestamp instead of hard deleting to prevent FK constraint violations
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    // Check if conversation exists and is not already deleted
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          select: { id: true },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    if (conversation.deletedAt) {
      return NextResponse.json(
        { ok: false, error: 'Conversation is already archived' },
        { status: 400 }
      )
    }

    // Soft delete: set deletedAt timestamp and status
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        deletedAt: new Date(),
        status: 'deleted',
      },
    })

    console.log(`🗑️ Admin ${user.email} archived conversation ${conversationId} (soft delete)`)

    return NextResponse.json({
      ok: true,
      message: `Conversation archived successfully`,
      deletedMessages: conversation.messages.length,
    })
  } catch (error: any) {
    console.error('Error archiving conversation:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to archive conversation' },
      { status: 500 }
    )
  }
}

