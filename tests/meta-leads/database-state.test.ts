import { describe, it, expect } from 'vitest'
import { getTestPrisma } from '@/lib/test/db'

describe('Meta Leads - Database State', () => {
  const prisma = getTestPrisma()

  it('has meta leadgen state for workspace', async () => {
    const state = await prisma.metaLeadgenState.findUnique({
      where: { workspaceId: 1 },
    })

    expect(state, 'MetaLeadgenState row is missing').toBeTruthy()
    if (!state) return

    expect(state.selectedPageId, 'selectedPageId is not set').toBeTruthy()
  })

  it('has no unresolved leadgen errors', async () => {
    const errors = await prisma.externalEventLog.findMany({
      where: { provider: 'meta', eventType: 'leadgen', status: 'error' },
      orderBy: { receivedAt: 'desc' },
      take: 5,
    })

    if (errors.length > 0) {
      const details = errors.map((err) => `${err.externalId}: ${err.error}`).join(' | ')
      expect(errors, `Recent leadgen errors found: ${details}`).toHaveLength(0)
    }
  })

  it('tracks recent leadgen activity timestamps', async () => {
    const state = await prisma.metaLeadgenState.findUnique({
      where: { workspaceId: 1 },
    })

    expect(state, 'MetaLeadgenState row is missing').toBeTruthy()
    if (!state) return

    const hasActivity = Boolean(state.lastLeadgenReceivedAt || state.lastLeadgenProcessedAt)
    expect(hasActivity, 'No leadgen activity timestamps found').toBe(true)
  })
})
