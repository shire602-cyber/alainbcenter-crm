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

    // E) FIX NOTIFICATIONS SCHEMA MISMATCH
    // Guard code: Don't query snoozedUntil if column doesn't exist in production DB
    // Use try-catch to handle missing column gracefully
    let notifications
    try {
      // Try to query with snoozedUntil (if column exists)
      notifications = await prisma.notification.findMany({
        where: {
          // Only show notifications that are not snoozed (if column exists)
          // If column doesn't exist, Prisma will throw and we'll catch it
          OR: [
            { snoozedUntil: null },
            { snoozedUntil: { lt: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit to last 100 notifications
      })
    } catch (schemaError: any) {
      // If snoozedUntil column doesn't exist, query without it
      if (schemaError.message?.includes('snoozedUntil') || schemaError.code === 'P2021') {
        console.warn('⚠️ [NOTIFICATIONS] snoozedUntil column not found - querying without it')
        notifications = await prisma.notification.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      } else {
        throw schemaError
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

