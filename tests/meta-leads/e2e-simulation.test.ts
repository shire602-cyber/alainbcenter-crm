import { describe, it, expect, beforeAll, vi } from 'vitest'
import { getTestPrisma, resetTestDatabase } from '@/lib/test/db'
import { encryptToken } from '@/lib/integrations/meta/encryption'
import {
  buildLeadgenWebhookPayload,
  buildMetaWebhookRequest,
} from '../helpers/metaLeadsTestHelpers'

const mockGetLeadGen = vi.fn()
const mockGraphAPIGet = vi.fn()

vi.mock('@/server/integrations/meta/graph', () => ({
  getLeadGen: (...args: any[]) => mockGetLeadGen(...args),
  graphAPIGet: (...args: any[]) => mockGraphAPIGet(...args),
}))

vi.mock('@/server/integrations/meta/subscribe', () => ({
  checkPageWebhookSubscription: vi.fn().mockResolvedValue({ subscribed: true }),
}))

describe('Meta Leads - End-to-End Webhook Simulation', () => {
  const prisma = getTestPrisma()
  const pageId = 'page_e2e_1'
  const leadgenId = `leadgen_e2e_${Date.now()}`
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
        metaUserId: 'user_e2e_1',
        pageId,
        pageName: 'E2E Page',
        pageAccessToken: encryptToken('page_token_e2e'),
        metaUserAccessTokenLong: encryptToken('user_token_e2e'),
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

  testCase('processes a signed webhook payload end-to-end', async () => {
    const { POST } = await import('../src/app/api/webhooks/meta-leads/route')
    process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-app-secret'

    mockGetLeadGen.mockResolvedValue({
      id: leadgenId,
      created_time: new Date().toISOString(),
      form_id: 'form_e2e',
      ad_id: 'ad_e2e',
      field_data: [
        { name: 'full_name', values: ['E2E User'] },
        { name: 'email', values: ['e2e@example.com'] },
        { name: 'phone_number', values: ['+971501234568'] },
      ],
    })

    mockGraphAPIGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/form_e2e') return { name: 'E2E Form' }
      if (endpoint === '/ad_e2e') return { name: 'E2E Ad', campaign_id: 'camp_e2e' }
      if (endpoint === '/camp_e2e') return { name: 'E2E Campaign' }
      return {}
    })

    const payload = buildLeadgenWebhookPayload({
      leadgenId,
      pageId,
      formId: 'form_e2e',
      adId: 'ad_e2e',
    })

    const request = buildMetaWebhookRequest({
      url: 'http://localhost/api/webhooks/meta-leads',
      payload,
      appSecret: process.env.META_APP_SECRET,
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 250))

    const event = await prisma.externalEventLog.findUnique({
      where: { provider_externalId: { provider: 'meta', externalId: leadgenId } },
    })

    expect(event, 'ExternalEventLog not created for leadgen event').toBeTruthy()
    if (!event) return
    expect(event.status).toBe('processed')
  })
})
