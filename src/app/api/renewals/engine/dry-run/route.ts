import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { runRenewalEngine } from '@/lib/renewals/engine'

/**
 * POST /api/renewals/engine/dry-run
 * Preview what the follow-up engine would do without sending messages
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthApi()

    // Check if user is ADMIN or MANAGER
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Unauthorized. Only ADMIN and MANAGER can run the engine.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const config = {
      windowDays: body.windowDays || 30,
      serviceTypes: body.serviceTypes || undefined,
      assignedToUserId: body.assignedToUserId || undefined,
      onlyNotContacted: body.onlyNotContacted || false,
      dryRun: true,
    }

    const result = await runRenewalEngine(config)

    // Enhance candidates with additional details for dry run display
    const enhancedCandidates = result.candidates.map(candidate => ({
      renewalItemId: candidate.renewalItemId,
      lead: {
        id: candidate.leadId,
        name: candidate.leadName,
        phone: candidate.phone,
      },
      renewalType: candidate.renewalType,
      stage: candidate.stage,
      template: candidate.templateName,
      channel: candidate.channel,
      estimatedValue: candidate.estimatedValue,
      expiresAt: candidate.expiresAt.toISOString(),
      daysRemaining: candidate.daysRemaining,
      variables: candidate.variables,
      willSend: candidate.willSend,
      reasonIfSkipped: candidate.reasonIfSkipped,
    }))

    return NextResponse.json({
      ok: true,
      candidates: enhancedCandidates,
      totals: result.totals,
      errors: result.errors,
    })
  } catch (error: any) {
    console.error('POST /api/renewals/engine/dry-run error:', error)
    return NextResponse.json(
      { 
        ok: false,
        error: error?.message ?? 'Failed to run dry-run',
        candidates: [],
        totals: { sendCount: 0, skipCount: 0, failedCount: 0 },
        errors: [error?.message || 'Unknown error'],
      },
      { status: 500 }
    )
  }
}

