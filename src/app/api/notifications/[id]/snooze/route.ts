/**
 * Snooze Notification API
 * 
 * POST /api/notifications/[id]/snooze
 * Snoozes a notification until a specified time
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    const resolvedParams = await params
    const notificationId = parseInt(resolvedParams.id)

    if (isNaN(notificationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid notification ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { minutes } = body

    if (!minutes || typeof minutes !== 'number') {
      return NextResponse.json(
        { ok: false, error: 'Minutes required' },
        { status: 400 }
      )
    }

    const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000)

    await prisma.notification.update({
      where: { id: notificationId },
      data: { snoozedUntil },
    })

    return NextResponse.json({
      ok: true,
      snoozedUntil: snoozedUntil.toISOString(),
    })
  } catch (error: any) {
    console.error('POST /api/notifications/[id]/snooze error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to snooze notification' },
      { status: 500 }
    )
  }
}

