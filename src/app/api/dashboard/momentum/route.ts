import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, subDays, addDays } from 'date-fns'

/**
 * GET /api/dashboard/momentum
 * 
 * Returns today's impact metrics:
 * - repliesToday: count of outbound messages sent today
 * - quotesToday: count of quotes/tasks created today
 * - renewals7d: count of renewals due in next 7 days
 * - revenuePotentialToday: sum of expected revenue (if available)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const sevenDaysFromNow = addDays(now, 7)

    // 1. Replies sent today (outbound messages)
    const repliesToday = await prisma.message.count({
      where: {
        direction: 'OUTBOUND',
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    // 2. Quotes created today (QUOTE or PROPOSAL tasks)
    const quotesToday = await prisma.task.count({
      where: {
        type: {
          in: ['QUOTE', 'PROPOSAL'],
        },
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    // 3. Renewals due next 7 days (leads with expiryDate within 7 days)
    const renewals7d = await prisma.lead.count({
      where: {
        expiryDate: {
          gte: now,
          lte: sevenDaysFromNow,
        },
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
    })

    // 4. Revenue potential today (sum of expectedRevenue or aiScore-based estimate)
    // For now, use a simple heuristic: count of qualified leads * average deal size estimate
    // If expectedRevenue field exists, sum it; otherwise use placeholder
    const qualifiedLeads = await prisma.lead.count({
      where: {
        stage: {
          in: ['QUALIFIED', 'PROPOSAL_SENT'],
        },
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    // Simple estimate: qualified leads * average deal size (placeholder: 5000 AED)
    // In production, this would use actual expectedRevenue field if available
    const revenuePotentialToday = qualifiedLeads * 5000

    return NextResponse.json({
      repliesToday,
      quotesToday,
      renewals7d,
      revenuePotentialToday: revenuePotentialToday > 0 ? revenuePotentialToday : null,
    })
  } catch (error: any) {
    console.error('Failed to load momentum metrics:', error)
    return NextResponse.json(
      {
        repliesToday: 0,
        quotesToday: 0,
        renewals7d: 0,
        revenuePotentialToday: null,
      },
      { status: 500 }
    )
  }
}

