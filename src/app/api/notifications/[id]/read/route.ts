import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/notifications/[id]/read
 * Mark a notification as read
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
    const { id } = await params
    const notificationId = parseInt(id)

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('POST /api/notifications/[id]/read error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to mark notification as read' },
      { status: 500 }
    )
  }
}

