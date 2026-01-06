/**
 * POST /api/cron/renewal-reminders
 * 
 * Process renewal reminders (called by Vercel cron)
 * Protected by CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { processRenewalReminders } from '@/lib/renewals/processReminders'

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'

    let isAuthorized = false
    
    if (vercelCronHeader) {
      isAuthorized = true
      console.log('✅ Vercel cron request detected for renewal reminders')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === cronSecret) {
        isAuthorized = true
        console.log('✅ Authorized via CRON_SECRET for renewal reminders')
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Missing or invalid authorization' },
        { status: 401 }
      )
    }

    // Get options from query or body
    const { searchParams } = new URL(req.url)
    const dryRun = searchParams.get('dryRun') === 'true'
    const limit = parseInt(searchParams.get('limit') || '100')

    // Process reminders
    const results = await processRenewalReminders({
      dryRun,
      limit,
    })

    return NextResponse.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Renewal reminders cron error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Renewal reminders cron endpoint',
    timestamp: new Date().toISOString(),
  })
}

