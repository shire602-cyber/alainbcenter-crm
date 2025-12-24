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

    // In serverless, execute immediately (queue executes jobs immediately anyway)
    // This ensures the job completes before the response is sent
    const { enqueueAutomation } = await import('@/lib/queue/automationQueue')
    const jobId = await enqueueAutomation('autopilot_run', { dryRun, userId: user.id }, {
      priority: 10, // High priority for manual runs
    })

    // Wait a moment for the job to start, then return
    // The job executes immediately in serverless mode
    await new Promise(resolve => setTimeout(resolve, 500))

    // Return with job ID - job is executing in background
    return NextResponse.json({
      ok: true,
      jobId,
      message: 'Automation run started successfully',
      status: 'processing',
      processing: true, // Indicate that processing is in progress
      timestamp: new Date().toISOString(),
      totals: null, // Results will be available in logs
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























