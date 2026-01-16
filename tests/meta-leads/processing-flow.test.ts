import { describe, it, expect, beforeAll, vi } from 'vitest'
import { getTestPrisma, resetTestDatabase } from '@/lib/test/db'
import { encryptToken } from '@/lib/integrations/meta/encryption'

const mockGetLeadGen = vi.fn()
const mockGraphAPIGet = vi.fn()

vi.mock('@/server/integrations/meta/graph', () => ({
  getLeadGen: (...args: any[]) => mockGetLeadGen(...args),
  graphAPIGet: (...args: any[]) => mockGraphAPIGet(...args),
}))

vi.mock('@/server/integrations/meta/subscribe', () => ({
  checkPageWebhookSubscription: vi.fn().mockResolvedValue({ subscribed: true }),
}))

describe('Meta Leads - Processing Flow', () => {
  const prisma = getTestPrisma()
  const pageId = 'page_test_123'
  const leadgenId = `leadgen_${Date.now()}`
  const allowWrites = process.env.META_DIAGNOSTICS_ALLOW_WRITES === 'true'
  const testCase = allowWrites ? it : it.skip

  beforeAll(async () => {
    if (!allowWrites) return
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    }

    await resetTestDatabase()

    await prisma.metaConnection.create({
      data: {
        workspaceId: 1,
        provider: 'meta',
        metaUserId: 'user_123',
        pageId,
        pageName: 'Test Page',
        pageAccessToken: encryptToken('page_token_test'),
        metaUserAccessTokenLong: encryptToken('user_token_test'),
        metaUserTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scopes: JSON.stringify(['leadgen', 'leads_retrieval']),
        triggerSubscribed: true,
        status: 'connected',
      },
    })

    await prisma.metaLeadgenState.create({
      data: {
        workspaceId: 1,
        selectedPageId: pageId,
        webhookSubscribedAt: new Date(),
      },
    })
  })

  testCase('processes a valid leadgen event', async () => {
    mockGetLeadGen.mockResolvedValue({
      id: leadgenId,
      created_time: new Date().toISOString(),
      form_id: 'form_1',
      ad_id: 'ad_1',
      field_data: [
        { name: 'full_name', values: ['Test User'] },
        { name: 'email', values: ['test@example.com'] },
        { name: 'phone_number', values: ['+971501234567'] },
        { name: 'service', values: ['Business setup'] },
      ],
    })

    mockGraphAPIGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/form_1') return { name: 'Test Form' }
      if (endpoint === '/ad_1') return { name: 'Test Ad', campaign_id: 'camp_1' }
      if (endpoint === '/camp_1') return { name: 'Test Campaign' }
      return {}
    })

    const { processLeadgenEvent } = await import('../src/server/integrations/meta/leadgen')

    const result = await processLeadgenEvent({
      payload: {
        leadgenId,
        formId: 'form_1',
        adId: 'ad_1',
        pageId,
        createdTime: Math.floor(Date.now() / 1000),
      },
      source: 'webhook',
    })

    expect(result.ok).toBe(true)
    expect(result.leadId).toBeTruthy()

    const lead = await prisma.lead.findFirst({
      where: { metaLeadgenId: leadgenId },
    })

    expect(lead, 'Lead not created for leadgen event').toBeTruthy()
    if (!lead) return
    expect(lead.source).toBe('META_LEAD_AD')
  })

  testCase('deduplicates duplicate leadgen events', async () => {
    const { processLeadgenEvent } = await import('../src/server/integrations/meta/leadgen')

    const result = await processLeadgenEvent({
      payload: {
        leadgenId,
        formId: 'form_1',
        adId: 'ad_1',
        pageId,
        createdTime: Math.floor(Date.now() / 1000),
      },
      source: 'webhook',
    })

    expect(result.deduped).toBe(true)
  })

  testCase('handles missing lead data', async () => {
    mockGetLeadGen.mockResolvedValueOnce(null)

    const { processLeadgenEvent } = await import('../src/server/integrations/meta/leadgen')

    const result = await processLeadgenEvent({
      payload: {
        leadgenId: `leadgen_missing_${Date.now()}`,
        formId: 'form_1',
        adId: 'ad_1',
        pageId,
        createdTime: Math.floor(Date.now() / 1000),
      },
      source: 'webhook',
    })

    expect(result.ok).toBe(false)
  })
})
