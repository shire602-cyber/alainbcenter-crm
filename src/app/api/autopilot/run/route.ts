import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { runAutopilot } from '@/lib/autopilot/runAutopilot'
import { prisma } from '@/lib/prisma'

// Configure for Vercel serverless
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for automation runs

// POST /api/autopilot/run
// Manual trigger for autopilot (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminApi()

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    // Update status to "Processing" in database
    try {
      await prisma.automationRunLog.create({
        data: {
          ruleKey: 'autopilot_manual_run',
          status: 'PROCESSING',
          message: 'Automation run queued',
          userId: user.id,
          ranAt: new Date(),
        },
      })
    } catch (logError) {
      console.warn('Failed to create processing log:', logError)
    }

    // Execute autopilot directly - don't use queue for manual runs
    // This ensures we get immediate results and proper error handling
    console.log('🚀 Running autopilot directly (manual trigger)')
    const result = await runAutopilot({ dryRun })
    
    console.log('✅ Autopilot run completed:', {
      rules: result.totals.rules,
      sent: result.totals.sent,
      skipped: result.totals.skipped,
      failed: result.totals.failed,
    })

    // Update log status to completed
    try {
      await prisma.automationRunLog.updateMany({
        where: {
          ruleKey: 'autopilot_manual_run',
          status: 'PROCESSING',
          userId: user.id,
        },
        data: {
          status: 'COMPLETED',
          message: `Completed: ${result.totals.rules} rules, ${result.totals.sent} sent, ${result.totals.skipped} skipped, ${result.totals.failed} failed`,
        },
      })
    } catch (logError) {
      console.warn('Failed to update log status:', logError)
    }

    // Return results immediately
    return NextResponse.json({
      ok: true,
      message: 'Automation run completed successfully',
      status: 'completed',
      processing: false,
      timestamp: new Date().toISOString(),
      totals: {
        rules: result.totals.rules || 0,
        sent: result.totals.sent || 0,
        skipped: result.totals.skipped || 0,
        failed: result.totals.failed || 0,
      },
    })
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























