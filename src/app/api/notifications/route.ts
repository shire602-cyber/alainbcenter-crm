import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/notifications
 * Get all notifications for the current user
 */
export async function GET(req: NextRequest) {
  try {
    await getCurrentUser()

    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 notifications
    })

    const unreadCount = notifications.filter(n => !n.isRead).length

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount,
    })
  } catch (error: any) {
    console.error('GET /api/notifications error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

