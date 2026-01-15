import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { listRecentLeadgenEvents } from '@/server/integrations/meta/leadgen'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const events = await listRecentLeadgenEvents(50)
    return NextResponse.json({
      ok: true,
      events: events.map((event) => ({
        leadgenId: event.externalId,
        status: event.status,
        receivedAt: event.receivedAt,
        processedAt: event.processedAt,
        error: event.error,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch leadgen events' },
      { status: 500 }
    )
  }
}
