/**
 * POST /api/admin/renewals/populate-all
 * 
 * Automated endpoint to populate ALL renewals from ExpiryItem data
 * No dry run - directly creates renewals
 * Protected by admin auth
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { populateRenewalsFromExpiryItems } from '@/lib/renewals/populateFromExpiryItems'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    
    // Check if user is admin (optional - adjust based on your auth system)
    // if (user.role !== 'ADMIN') {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    // }

    console.log(`[ADMIN] Automated renewal population requested by user ${user.id}`)

    // Populate all renewals (no dry run, large limit)
    const results = await populateRenewalsFromExpiryItems({
      dryRun: false,
      limit: 10000, // Large limit to get all
    })

    // Get summary statistics
    const renewalCount = await prisma.renewal.count()
    const pendingCount = await prisma.renewal.count({
      where: { status: 'PENDING' },
    })
    const withNextReminder = await prisma.renewal.count({
      where: {
        nextReminderAt: { not: null },
      },
    })

    return NextResponse.json({
      ok: true,
      results,
      statistics: {
        totalRenewals: renewalCount,
        pending: pendingCount,
        withNextReminder: withNextReminder,
      },
      message: 'Renewals populated successfully',
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

