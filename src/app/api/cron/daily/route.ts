import { NextRequest, NextResponse } from 'next/server'
import { runAutopilot } from '@/lib/autopilot/runAutopilot'

// POST /api/cron/daily
// Daily cron endpoint (protected by CRON_SECRET)
export async function POST(req: NextRequest) {
  try {
    // Validate CRON_SECRET
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    // Check secret from query param or header
    const querySecret = req.nextUrl.searchParams.get('secret')
    const headerSecret = req.headers.get('x-cron-secret')

    if (querySecret !== cronSecret && headerSecret !== cronSecret) {
      return NextResponse.json(
        { ok: false, error: 'Invalid secret' },
        { status: 403 }
      )
    }

    // Run autopilot
    const result = await runAutopilot({ dryRun: false })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Cron daily error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to run daily cron',
      },
      { status: 500 }
    )
  }
}

// GET /api/cron/daily
// Health check (no secret required)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Cron endpoint is active. Use POST with CRON_SECRET to trigger.',
  })
}






















