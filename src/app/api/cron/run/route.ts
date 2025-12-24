/**
 * POST /api/cron/run
 * 
 * Scheduled automation endpoint (callable from external cron)
 * Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScheduledRules } from '@/lib/automation/engine'

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret - Vercel cron sends x-vercel-cron header, or check Authorization
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'

    // Allow Vercel cron (has x-vercel-cron header) OR valid CRON_SECRET
    let isAuthorized = false
    
    if (vercelCronHeader) {
      // Vercel cron request - automatically authorized
      isAuthorized = true
      console.log('✅ Vercel cron request detected')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === cronSecret) {
        isAuthorized = true
        console.log('✅ Authorized via CRON_SECRET')
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Missing or invalid authorization' },
        { status: 401 }
      )
    }

    // Get schedule type from query or body
    const { searchParams } = new URL(req.url)
    const schedule = searchParams.get('schedule') || 'daily'
    
    if (schedule !== 'daily' && schedule !== 'hourly') {
      return NextResponse.json(
        { ok: false, error: 'Schedule must be "daily" or "hourly"' },
        { status: 400 }
      )
    }

    // Run scheduled rules
    const result = await runScheduledRules(schedule as 'daily' | 'hourly')

    return NextResponse.json({
      ok: true,
      schedule,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (error: any) {
    console.error('Cron endpoint error:', error)
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
    message: 'Cron endpoint is running. Use POST with Authorization header.',
  })
}

