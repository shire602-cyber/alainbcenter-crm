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

    // TASK 2: Safe delete strategy - soft delete to prevent FK constraint violations
    // Check if conversation exists and is not already deleted
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            select: { id: true },
          },
        },
      })
    } catch (error: any) {
      // If deletedAt column doesn't exist, fail loudly
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
        return NextResponse.json(
          { 
            ok: false, 
            error: 'DB migrations not applied. Run: npx prisma migrate deploy',
            code: 'DB_MISMATCH',
          },
          { status: 500 }
        )
      }
      throw error
    }

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Check if already deleted (safe property access)
    if ((conversation as any).deletedAt) {
      return NextResponse.json(
        { ok: false, error: 'Conversation is already archived' },
        { status: 400 }
      )
    }

    // TASK 2: Soft delete - set deletedAt timestamp and status (prevents FK constraint violations)
    // This is safe because OutboundJob, OutboundMessageLog, Message all reference conversationId
    // Soft delete preserves referential integrity
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          deletedAt: new Date(),
          status: 'deleted',
        },
      })
    } catch (error: any) {
      // If deletedAt column doesn't exist, fail loudly
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
        return NextResponse.json(
          { 
            ok: false, 
            error: 'DB migrations not applied. Run: npx prisma migrate deploy',
            code: 'DB_MISMATCH',
          },
          { status: 500 }
        )
      }
      // Handle FK constraint violations (P2003) - should not happen with soft delete, but handle gracefully
      if (error.code === 'P2003') {
        console.error(`[DB-FK] Foreign key constraint violation when deleting conversation ${conversationId}:`, error.message)
        return NextResponse.json(
          { 
            ok: false, 
            error: 'Cannot delete conversation due to foreign key constraints. This should not happen with soft delete.',
            code: 'FK_CONSTRAINT',
          },
          { status: 500 }
        )
      }
      throw error
    }

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

