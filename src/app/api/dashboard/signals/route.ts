import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getAllSignals } from '@/lib/dashboard/signals'

/**
 * GET /api/dashboard/signals
 * 
 * Returns structured signals for Control Tower:
 * - Renewals (expiry-driven)
 * - Waiting on Customer (stalled conversations)
 * - Alerts (SLA, unassigned, missing data, quote pending)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    
    const signals = await getAllSignals()
    
    return NextResponse.json(signals)
  } catch (error: any) {
    console.error('Failed to load signals:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to load signals',
        renewals: [],
        waiting: [],
        alerts: [],
        counts: { renewalsTotal: 0, waitingTotal: 0, alertsTotal: 0 },
      },
      { status: 500 }
    )
  }
}











