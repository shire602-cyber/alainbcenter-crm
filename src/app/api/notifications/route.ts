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
      // TASK 3: Loud failure for schema mismatch - do NOT silently work around
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Notification.snoozedUntil column does not exist. DB migrations not applied.')
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

