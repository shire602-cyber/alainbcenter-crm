/**
 * GET /api/leads/[id]/compliance
 * 
 * Get compliance status for a lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getLeadComplianceStatus } from '@/lib/compliance'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const compliance = await getLeadComplianceStatus(leadId)

    return NextResponse.json({
      ok: true,
      compliance,
    })
  } catch (error: any) {
    console.error('Error getting compliance status:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


















