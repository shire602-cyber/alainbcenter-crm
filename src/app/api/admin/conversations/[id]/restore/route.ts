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

    // Step A: Check if conversation exists (with P2022 handling)
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
    } catch (error: any) {
      // Step A: Loud failure for schema mismatch
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
        return NextResponse.json(
          { 
            ok: false, 
            code: 'DB_MISMATCH',
            error: 'DB migrations not applied. Run: npx prisma migrate deploy',
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

    // Safe property access for deletedAt
    if (!(conversation as any).deletedAt) {
      return NextResponse.json(
        { ok: false, error: 'Conversation is not archived' },
        { status: 400 }
      )
    }

    // Step A: Restore: clear deletedAt and set status back to open (with P2022 handling)
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          deletedAt: null,
          status: 'open',
        },
      })
    } catch (error: any) {
      // Step A: Loud failure for schema mismatch
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
        return NextResponse.json(
          { 
            ok: false, 
            code: 'DB_MISMATCH',
            error: 'DB migrations not applied. Run: npx prisma migrate deploy',
          },
          { status: 500 }
        )
      }
      throw error
    }

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

