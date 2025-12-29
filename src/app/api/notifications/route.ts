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

    // D) REMOVE FRAGILE GUARDS: Query with snoozedUntil (migration must be applied)
    // Production requires: npx prisma migrate deploy
    // If column doesn't exist, Prisma will throw - this ensures migration is applied
    const notifications = await prisma.notification.findMany({
      where: {
        // Only show notifications that are not snoozed
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lt: new Date() } },
        ],
      },
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

