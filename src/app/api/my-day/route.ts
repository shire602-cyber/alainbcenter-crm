/**
 * MY DAY COMMAND CENTER API
 * 
 * GET /api/my-day
 * Returns prioritized Command Center data with 3 sections:
 * - ACTION REQUIRED (max 3 items)
 * - QUICK WINS (time-estimated, non-blocking)
 * - WAITING ON CUSTOMER (read-only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getCommandCenter } from '@/lib/myDay/commandCenter'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    
    const commandCenter = await getCommandCenter(user.id)

    return NextResponse.json({
      ...commandCenter,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('GET /api/my-day error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch command center data' },
      { status: 500 }
    )
  }
}

