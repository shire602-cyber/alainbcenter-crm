import { describe, it, expect } from 'vitest'
import { getTestPrisma } from '@/lib/test/db'
import { decryptToken } from '@/lib/integrations/meta/encryption'
import { graphAPIGet } from '@/server/integrations/meta/graph'
import { fetchLeadgenForms, fetchLeadgenIdsForForm } from '@/server/integrations/meta/leadgen'

describe('Meta Leads - Graph API Connectivity', () => {
  const prisma = getTestPrisma()

  it('can access page data with page token', async () => {
    const connection = await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    expect(connection, 'No active Meta connection found').toBeTruthy()
    if (!connection) return

    const pageToken = decryptToken(connection.pageAccessToken)
    expect(pageToken.length > 10).toBe(true)

    const pageInfo = await graphAPIGet<{ id: string; name?: string }>(
      `/${connection.pageId}`,
      pageToken,
      ['id', 'name']
    )

    expect(pageInfo?.id, 'Failed to fetch page info via Graph API').toBe(connection.pageId)
  })

  it('can list leadgen forms for page', async () => {
    const connection = await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    expect(connection, 'No active Meta connection found').toBeTruthy()
    if (!connection) return

    const pageToken = decryptToken(connection.pageAccessToken)
    const forms = await fetchLeadgenForms(connection.pageId, pageToken)

    expect(Array.isArray(forms), 'Graph API returned invalid leadgen_forms').toBe(true)
  })

  it('can check leads_retrieval permission', async () => {
    const connection = await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    expect(connection, 'No active Meta connection found').toBeTruthy()
    if (!connection) return

    expect(connection.metaUserId, 'Meta user ID is required to check permissions').toBeTruthy()
    expect(connection.metaUserAccessTokenLong, 'Meta user token is missing').toBeTruthy()
    if (!connection.metaUserId || !connection.metaUserAccessTokenLong) return

    const userToken = decryptToken(connection.metaUserAccessTokenLong)
    const permissions = await graphAPIGet<{ data: Array<{ permission: string; status: string }> }>(
      `/${connection.metaUserId}/permissions`,
      userToken
    )

    const hasLeadsRetrieval = permissions.data.some(
      (perm) => perm.permission === 'leads_retrieval' && perm.status === 'granted'
    )

    expect(hasLeadsRetrieval, 'leads_retrieval permission is not granted').toBe(true)
  })

  it('can fetch leadgen IDs for a form when available', async () => {
    const connection = await prisma.metaConnection.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    })

    expect(connection, 'No active Meta connection found').toBeTruthy()
    if (!connection) return

    const pageToken = decryptToken(connection.pageAccessToken)
    const forms = await fetchLeadgenForms(connection.pageId, pageToken)

    if (forms.length === 0) {
      return
    }

    const leads = await fetchLeadgenIdsForForm(forms[0].id, pageToken, null)
    expect(Array.isArray(leads), 'Graph API returned invalid leads list').toBe(true)
  })
})
