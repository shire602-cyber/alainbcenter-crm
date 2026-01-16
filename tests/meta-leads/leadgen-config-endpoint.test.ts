import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestPrisma, resetTestDatabase } from '@/lib/test/db'

vi.mock('@/lib/authApi', () => ({
  requireAdminApi: vi.fn().mockResolvedValue({ id: 1, role: 'ADMIN' }),
}))

describe('Meta Leads - Leadgen Config Endpoint', () => {
  const prisma = getTestPrisma()

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    }

    await resetTestDatabase()
  })

  it('stores ad account and form ids', async () => {
    const { POST } = await import('../src/app/api/integrations/meta/leadgen-config/route')
    const request = new NextRequest('http://localhost/api/integrations/meta/leadgen-config', {
      method: 'POST',
      body: JSON.stringify({
        selectedAdAccountId: '1050470112230733',
        selectedFormIds: ['form_1', 'form_2'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.selectedAdAccountId).toBe('1050470112230733')
    expect(data.selectedFormIds).toEqual(['form_1', 'form_2'])

    const state = await prisma.metaLeadgenState.findUnique({ where: { workspaceId: 1 } })
    expect(state?.selectedAdAccountId).toBe('1050470112230733')
    expect(state?.selectedFormIds).toBe(JSON.stringify(['form_1', 'form_2']))
  })
})
