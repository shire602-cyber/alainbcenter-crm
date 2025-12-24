import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
export async function POST(req: NextRequest) {
  try {
    await getCurrentUser()

    await prisma.notification.updateMany({
      where: { isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('POST /api/notifications/read-all error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to mark all notifications as read' },
      { status: 500 }
    )
  }
}

