/**
 * DELETE /api/admin/conversations/[id]/delete
 * 
 * Admin-only endpoint to delete a conversation and all its messages
 * Used for testing purposes
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

    // Check if conversation exists
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

    // Delete all related data in transaction
    // IMPORTANT: Delete in correct order to respect foreign key constraints
    await prisma.$transaction(async (tx) => {
      // First, get all message IDs for this conversation (needed for MessageStatusEvent deletion)
      const messages = await tx.message.findMany({
        where: { conversationId: conversationId },
        select: { id: true },
      })
      const messageIds = messages.map(m => m.id)

      // Delete message status events FIRST (they reference messages via messageId)
      if (messageIds.length > 0) {
        await tx.messageStatusEvent.deleteMany({
          where: { 
            OR: [
              { conversationId: conversationId },
              { messageId: { in: messageIds } }
            ]
          },
        })
      } else {
        // Also delete by conversationId if no messages found
        await tx.messageStatusEvent.deleteMany({
          where: { conversationId: conversationId },
        })
      }

      // Now delete messages (MessageStatusEvents are already deleted)
      await tx.message.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete communication logs
      await tx.communicationLog.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete AI drafts
      await tx.aIDraft.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete AI action logs
      await tx.aIActionLog.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete tasks associated with conversation
      await tx.task.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete notifications
      await tx.notification.deleteMany({
        where: { conversationId: conversationId },
      })

      // Delete chat messages (if ChatMessage model exists)
      // Note: ChatMessage doesn't have conversationId, so we delete by contactId
      if (conversation.contactId) {
        try {
          await tx.chatMessage.deleteMany({
            where: { contactId: conversation.contactId },
          })
        } catch (e: any) {
          // ChatMessage might not exist - ignore silently
          console.warn('Could not delete ChatMessage (may not exist):', e.message)
        }
      }

      // Finally, delete the conversation
      await tx.conversation.delete({
        where: { id: conversationId },
      })
    })

    console.log(`🗑️ Admin ${user.email} deleted conversation ${conversationId} and ${conversation.messages.length} messages`)

    return NextResponse.json({
      ok: true,
      message: `Deleted conversation and ${conversation.messages.length} messages`,
      deletedMessages: conversation.messages.length,
    })
  } catch (error: any) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete conversation' },
      { status: 500 }
    )
  }
}

