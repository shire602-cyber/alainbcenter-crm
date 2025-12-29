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

    // Defensive: Query with snoozedUntil, but fallback if column doesn't exist (migration not applied)
    let notifications
    try {
      notifications = await prisma.notification.findMany({
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
    } catch (error: any) {
      // Defensive: If snoozedUntil column doesn't exist (P2022), retry without filter
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('⚠️ [NOTIFICATIONS] snoozedUntil column not found - migration not applied. Querying without snoozedUntil filter.')
        notifications = await prisma.notification.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      } else {
        throw error
      }
    }

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

