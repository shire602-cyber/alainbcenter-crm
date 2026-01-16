import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { checkMetaLeadgenReadiness, getLeadgenStateSummary, listLeadgenErrors } from '@/server/integrations/meta/leadgen'
import { runSlaAssertions } from '@/lib/sla/computeSlaDueAt'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const readiness = await checkMetaLeadgenReadiness()
    const { state, connection } = await getLeadgenStateSummary()
    const recentErrors = await listLeadgenErrors(5)

    return NextResponse.json({
      ok: readiness.ok,
      missing: readiness.missing,
      selectedPageId: readiness.selectedPageId,
      selectedAdAccountId: readiness.selectedAdAccountId,
      formIds: state.selectedFormIds ? JSON.parse(state.selectedFormIds) : [],
      tokenPresent: !!connection?.metaUserAccessTokenLong,
      tokenExpiresAt: connection?.metaUserTokenExpiresAt || null,
      webhookSubscribedAt: state.webhookSubscribedAt || null,
      lastLeadgenReceivedAt: state.lastLeadgenReceivedAt || null,
      lastLeadgenProcessedAt: state.lastLeadgenProcessedAt || null,
      pollerEnabled: state.pollerEnabled,
      lastPollRunAt: state.lastPollRunAt || null,
      lastPollAt: state.lastPollAt || null,
      recentErrors: recentErrors.map((err) => ({
        leadgenId: err.externalId,
        status: err.status,
        error: err.error,
        receivedAt: err.receivedAt,
      })),
      slaChecks:
        process.env.NODE_ENV !== 'production'
          ? runSlaAssertions()
          : undefined,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load status' },
      { status: 500 }
    )
  }
}
