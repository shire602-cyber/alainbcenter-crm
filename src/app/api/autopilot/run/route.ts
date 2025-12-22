import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { runAutopilot } from '@/lib/autopilot/runAutopilot'

// POST /api/autopilot/run
// Manual trigger for autopilot (admin only)
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    const result = await runAutopilot({ dryRun })

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























