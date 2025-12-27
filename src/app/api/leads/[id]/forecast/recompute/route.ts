import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { recomputeAndSaveForecast } from '@/lib/forecast/dealForecast'

// POST /api/leads/[id]/forecast/recompute
// Manually trigger forecast recomputation
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
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const forecast = await recomputeAndSaveForecast(leadId)

    return NextResponse.json({
      ok: true,
      forecast,
    })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/forecast/recompute error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to recompute forecast' },
      { status: error.statusCode || 500 }
    )
  }
}

