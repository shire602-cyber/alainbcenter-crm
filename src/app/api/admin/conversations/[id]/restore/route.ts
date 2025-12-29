/**
 * POST /api/admin/conversations/[id]/restore
 * 
 * Admin-only endpoint to restore a soft-deleted conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
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
    })

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    if (!conversation.deletedAt) {
      return NextResponse.json(
        { ok: false, error: 'Conversation is not archived' },
        { status: 400 }
      )
    }

    // Restore: clear deletedAt and set status back to open
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        deletedAt: null,
        status: 'open',
      },
    })

    console.log(`♻️ Admin ${user.email} restored conversation ${conversationId}`)

    return NextResponse.json({
      ok: true,
      message: `Conversation restored successfully`,
    })
  } catch (error: any) {
    console.error('Error restoring conversation:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to restore conversation' },
      { status: 500 }
    )
  }
}

