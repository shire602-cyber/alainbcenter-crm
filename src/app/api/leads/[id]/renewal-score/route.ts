/**
 * POST /api/leads/[id]/renewal-score
 * 
 * Compute and update renewal score for a lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { updateLeadRenewalScore } from '@/lib/renewals/scoring'

export async function POST(
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

    const score = await updateLeadRenewalScore(leadId)

    return NextResponse.json({
      ok: true,
      score,
    })
  } catch (error: any) {
    console.error('Error computing renewal score:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

















