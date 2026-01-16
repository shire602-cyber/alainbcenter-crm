import { describe, it, expect } from 'vitest'
import { getTestPrisma } from '@/lib/test/db'
import { decryptToken } from '@/lib/integrations/meta/encryption'

describe('Meta Leads - OAuth Connection State', () => {
  const prisma = getTestPrisma()

  it('has an active Meta connection with valid tokens', async () => {
    const connection = await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    expect(connection, 'No active Meta connection found').toBeTruthy()
    if (!connection) return

    expect(connection.pageAccessToken, 'Missing encrypted page access token').toBeTruthy()
    expect(
      () => decryptToken(connection.pageAccessToken),
      'Failed to decrypt page access token'
    ).not.toThrow()

    const decryptedPageToken = decryptToken(connection.pageAccessToken)
    expect(decryptedPageToken.length > 10).toBe(true)

    if (connection.metaUserAccessTokenLong) {
      expect(
        () => decryptToken(connection.metaUserAccessTokenLong as string),
        'Failed to decrypt user access token'
      ).not.toThrow()
    } else {
      expect(connection.metaUserAccessTokenLong, 'Missing user access token').toBeTruthy()
    }

    if (connection.metaUserTokenExpiresAt) {
      const expiresAt = new Date(connection.metaUserTokenExpiresAt)
      expect(
        expiresAt.getTime(),
        'Meta user token is expired'
      ).toBeGreaterThan(Date.now())
    }

    if (connection.scopes) {
      const scopes = JSON.parse(connection.scopes) as string[]
      expect(scopes.includes('leadgen'), 'Missing leadgen scope').toBe(true)
      expect(scopes.includes('leads_retrieval'), 'Missing leads_retrieval scope').toBe(true)
    } else {
      expect(connection.scopes, 'Missing connection scopes').toBeTruthy()
    }
  })
})
