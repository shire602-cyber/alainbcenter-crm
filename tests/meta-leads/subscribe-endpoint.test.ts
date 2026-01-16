import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestPrisma, resetTestDatabase } from '@/lib/test/db'
import { encryptToken } from '@/lib/integrations/meta/encryption'

vi.mock('@/lib/authApi', () => ({
  requireAdminApi: vi.fn().mockResolvedValue({ id: 1, role: 'ADMIN' }),
}))

vi.mock('@/server/integrations/meta/subscribe', () => ({
  subscribePageToWebhook: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/server/integrations/meta/storage', () => ({
  getDecryptedPageToken: vi.fn().mockResolvedValue('page_token_test'),
}))

describe('Meta Leads - Subscribe Endpoint', () => {
  const prisma = getTestPrisma()

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    }

    await resetTestDatabase()

    await prisma.metaConnection.create({
      data: {
        workspaceId: 1,
        provider: 'meta',
        metaUserId: 'user_subscribe_1',
        pageId: 'page_subscribe_1',
        pageName: 'Subscribe Page',
        pageAccessToken: encryptToken('page_token_test'),
        metaUserAccessTokenLong: encryptToken('user_token_test'),
        metaUserTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scopes: JSON.stringify(['leadgen', 'leads_retrieval']),
        triggerSubscribed: false,
        status: 'connected',
      },
    })
  })

  it('subscribes and updates state', async () => {
    const { POST } = await import('../src/app/api/integrations/meta/subscribe/route')
    const request = new NextRequest('http://localhost/api/integrations/meta/subscribe', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.subscribed).toBe(true)

    const connection = await prisma.metaConnection.findFirst({
      where: { pageId: 'page_subscribe_1' },
    })
    expect(connection?.triggerSubscribed).toBe(true)

    const state = await prisma.metaLeadgenState.findUnique({
      where: { workspaceId: 1 },
    })
    expect(state?.webhookSubscribedAt).toBeTruthy()
  })
})
