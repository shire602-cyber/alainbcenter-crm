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

    // Queue the job instead of running synchronously
    const { enqueueAutomation } = await import('@/lib/queue/automationQueue')
    const jobId = await enqueueAutomation('autopilot_run', { dryRun, userId: user.id }, {
      priority: 10, // High priority for manual runs
    })

    // Return immediately with job ID and processing status
    return NextResponse.json({
      ok: true,
      jobId,
      message: 'Automation run queued successfully',
      status: 'queued',
      processing: true, // Indicate that processing is in progress
      timestamp: new Date().toISOString(),
      totals: null, // Don't return zeros - indicate results are pending
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























