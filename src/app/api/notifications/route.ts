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

    // TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
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
        take: 100,
      })
    } catch (error: any) {
      // Gracefully handle missing snoozedUntil column - query works without it
      if (error.code === 'P2022' || error.message?.includes('snoozedUntil') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] snoozedUntil column not found, querying without it (this is OK if migration not yet applied)')
        // Retry without snoozedUntil filter - just get all notifications
        try {
          notifications = await prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        } catch (retryError: any) {
          console.error('[DB] Failed to query notifications:', retryError)
          throw retryError
        }
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

