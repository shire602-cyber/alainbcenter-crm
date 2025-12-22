/**
 * POST /api/leads/[id]/automation/run
 * 
 * Manually trigger automation rules for a specific lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { runAllRulesForLead } from '@/lib/automation/engine'

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

    const results = await runAllRulesForLead(leadId)

    return NextResponse.json({
      ok: true,
      leadId,
      rulesRun: results.length,
      results: results.map(r => ({
        status: r.status,
        reason: r.reason,
        actionsExecuted: r.actionsExecuted,
        errors: r.errors,
      })),
    })
  } catch (error: any) {
    console.error('Error running automation for lead:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


















