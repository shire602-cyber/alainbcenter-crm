import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { runAutopilot } from '@/lib/autopilot/runAutopilot'
import { prisma } from '@/lib/prisma'

// POST /api/autopilot/run
// Manual trigger for autopilot (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminApi()

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    const result = await runAutopilot({ dryRun })

    // Create a summary log entry so it persists and shows in "Recent Runs"
    try {
      await prisma.automationRunLog.create({
        data: {
          ruleKey: 'autopilot_manual_run',
          status: result.ok ? 'SUCCESS' : 'FAILED',
          message: result.ok 
            ? `Manual run: ${result.totals?.rules || 0} rules, ${result.totals?.sent || 0} sent, ${result.totals?.skipped || 0} skipped`
            : result.error || 'Run failed',
          details: JSON.stringify({
            totals: result.totals,
            mode: dryRun ? 'dry-run' : 'live',
            timestamp: new Date().toISOString(),
          }),
          userId: user.id,
          ranAt: new Date(),
        },
      })
    } catch (logError: any) {
      // Don't fail the whole request if logging fails
      console.warn('Failed to log autopilot run summary:', logError)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Autopilot run error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to run autopilot',
      },
      { status: error.statusCode || 500 }
    )
  }
}























