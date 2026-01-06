/**
 * CRON: Process Renewal Reminders
 * 
 * Runs every 5-15 minutes to process renewal reminders.
 * 
 * Endpoint: /api/cron/process-renewal-reminders
 * 
 * Can be triggered by:
 * - Vercel Cron (recommended)
 * - Manual API call
 * - Scheduled job runner
 */

import { NextRequest, NextResponse } from 'next/server'
import { processRenewalReminders } from '@/lib/renewals/processReminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/process-renewal-reminders
 * Process renewal reminders
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const max = parseInt(searchParams.get('max') || '50', 10)
    const dryRun = searchParams.get('dryRun') === 'true'

    console.log(`[RENEWAL-CRON] Starting renewal reminder processing max=${max} dryRun=${dryRun}`)

    const result = await processRenewalReminders({ max, dryRun })

    return NextResponse.json({
      success: result.ok,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error(`[RENEWAL-CRON] Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cron/process-renewal-reminders
 * Process renewal reminders (same as GET, for cron triggers)
 */
export async function POST(req: NextRequest) {
  return GET(req)
}

