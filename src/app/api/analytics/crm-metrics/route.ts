/**
 * CRM ANALYTICS API
 * 
 * GET /api/analytics/crm-metrics?days=30
 * Returns CRM metrics for the last N days (default: 30)
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCRMMetricsLastNDays } from '@/lib/analytics/crmMetrics'
import { requireAuthApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    
    // Admin only
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin only' },
        { status: 403 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter (1-365)' },
        { status: 400 }
      )
    }

    const metrics = await getCRMMetricsLastNDays(days)

    return NextResponse.json(metrics)
  } catch (error: any) {
    console.error('GET /api/analytics/crm-metrics error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

