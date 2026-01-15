import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { processLeadgenEvent } from '@/server/integrations/meta/leadgen'

/**
 * POST /api/webhooks/meta-leads/test
 * Admin-only test endpoint to fetch and ingest a Meta lead by leadgen_id
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { leadgenId } = body

    if (!leadgenId) {
      return NextResponse.json({ error: 'leadgenId is required' }, { status: 400 })
    }

    const result = await processLeadgenEvent({
      payload: { leadgenId },
      source: 'webhook',
    })

    return NextResponse.json({
      success: true,
      message: 'Lead ingested successfully',
      data: result,
    })
  } catch (error: any) {
    console.error('Meta test endpoint error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process test lead',
      },
      { status: error.statusCode || 500 }
    )
  }
}

