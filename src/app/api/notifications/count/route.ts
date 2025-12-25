import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/notifications/count
 * Get unread notification count
 */
export async function GET(req: NextRequest) {
  try {
    await getCurrentUser()

    const count = await prisma.notification.count({
      where: { isRead: false },
    })

    return NextResponse.json({ count })
  } catch (error: any) {
    console.error('GET /api/notifications/count error:', error)
    return NextResponse.json({ count: 0 })
  }
}

