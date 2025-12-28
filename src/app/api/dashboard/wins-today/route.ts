/**
 * WINS TODAY API
 * Returns metrics for today: replies sent, tasks completed, quotes sent
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    const [
      tasksCompleted,
      messagesSent,
      quotesSent,
    ] = await Promise.all([
      // Tasks completed today
      prisma.task.count({
        where: {
          OR: [
            { assignedUserId: user.id },
            { assignedUserId: null },
          ],
          status: 'DONE',
          doneAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Messages sent today
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          sentAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Quotes sent today (leads with quotationSentAt today)
      prisma.lead.count({
        where: {
          quotationSentAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
    ])

    return NextResponse.json({
      metrics: {
        tasksCompleted,
        messagesSent,
        quotesSent,
        revenueClosed: 0, // Would need to calculate from won deals
      },
    })
  } catch (error: any) {
    console.error('GET /api/dashboard/wins-today error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch wins' },
      { status: 500 }
    )
  }
}

