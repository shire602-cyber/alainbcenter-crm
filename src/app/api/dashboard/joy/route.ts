import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { computeJoyMetrics, computeFrictionAlerts } from '@/lib/joy/metrics'

/**
 * GET /api/dashboard/joy
 * 
 * Returns joy metrics and friction alerts for staff happiness tracking
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const [metrics, friction] = await Promise.all([
      computeJoyMetrics(),
      computeFrictionAlerts(),
    ])

    return NextResponse.json({
      ...metrics,
      friction,
    })
  } catch (error: any) {
    console.error('Failed to compute joy metrics:', error)
    return NextResponse.json(
      {
        ttfrMedianMinutes: null,
        tasksDone: 0,
        leadsAdvanced: 0,
        savedFromSla: 0,
        revenueActions: 0,
        streak: {
          daysActive: 0,
          todayDone: false,
        },
        friction: {
          highTtfr: false,
          overdueTasks: 0,
          waitingLong: 0,
        },
      },
      { status: 500 }
    )
  }
}


