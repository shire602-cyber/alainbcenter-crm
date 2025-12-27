/**
 * FOLLOW-UPS CRON JOB
 * 
 * POST /api/cron/process-followups
 * Processes follow-ups due today (Day 2, 5, 12, 22)
 * 
 * Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server'
import { processFollowupsDue } from '@/lib/followups/engine'

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Process follow-ups
    const result = await processFollowupsDue({ dryRun: false })

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('POST /api/cron/process-followups error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process follow-ups' },
      { status: 500 }
    )
  }
}

