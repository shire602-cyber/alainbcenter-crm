import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestPrisma } from '@/lib/test/db'

vi.mock('@/lib/auth-server', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 1, role: 'ADMIN' }),
}))

describe('Meta Leads - Integration Readiness', () => {
  const prisma = getTestPrisma()

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    }

    await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    await prisma.metaLeadgenState.findUnique({
      where: { workspaceId: 1 },
    })
  })

  it('returns readiness status with no missing items', async () => {
    const { GET } = await import('../src/app/api/debug/meta/leadgen-status/route')
    const request = new NextRequest('http://localhost/api/debug/meta/leadgen-status')
    const response = await GET(request)

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.ok, 'Meta leadgen readiness is not OK').toBe(true)
    expect(Array.isArray(data.missing), 'Missing list not returned').toBe(true)
    expect(data.missing.length, `Missing items: ${data.missing?.join(', ')}`).toBe(0)
  })
})
