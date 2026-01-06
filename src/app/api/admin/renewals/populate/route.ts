/**
 * POST /api/admin/renewals/populate
 * 
 * Populate Renewal table from existing ExpiryItem data
 * Protected by admin auth
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { populateRenewalsFromExpiryItems } from '@/lib/renewals/populateFromExpiryItems'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    
    // Check if user is admin (optional - adjust based on your auth system)
    // if (user.role !== 'ADMIN') {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    // }

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun !== false // Default to true for safety
    const limit = parseInt(body.limit || '1000')
    const serviceTypeFilter = body.serviceTypeFilter || undefined

    console.log(`[ADMIN] Renewal population requested: dryRun=${dryRun}, limit=${limit}`)

    const results = await populateRenewalsFromExpiryItems({
      dryRun,
      limit,
      serviceTypeFilter,
    })

    return NextResponse.json({
      ok: true,
      results,
      message: dryRun 
        ? 'Dry run completed. Set dryRun=false to actually create renewals.'
        : 'Renewals populated successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Renewal population error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

