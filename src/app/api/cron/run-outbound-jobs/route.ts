/**
 * CRON JOB: Run Outbound Jobs
 * 
 * Triggers job runner to process queued outbound jobs.
 * Can be called by Vercel Cron or external cron service.
 */

// Ensure Node.js runtime for Prisma compatibility
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production'

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Call job runner
    const jobRunnerUrl = new URL('/api/jobs/run-outbound', req.url)
    jobRunnerUrl.searchParams.set('token', process.env.JOB_RUNNER_TOKEN || 'dev-token-change-in-production')
    jobRunnerUrl.searchParams.set('max', '50') // Process up to 50 jobs per run
    
    const response = await fetch(jobRunnerUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    const data = await response.json()
    
    return NextResponse.json({
      ok: true,
      message: 'Job runner triggered',
      jobRunnerResult: data,
    })
  } catch (error: any) {
    console.error('❌ [CRON] Error triggering job runner:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

