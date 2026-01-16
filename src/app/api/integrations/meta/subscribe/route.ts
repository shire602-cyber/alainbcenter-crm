import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { subscribePageToWebhook } from '@/server/integrations/meta/subscribe'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json().catch(() => ({}))
    const pageId = typeof body?.pageId === 'string' ? body.pageId : null

    const connection = await prisma.metaConnection.findFirst({
      where: {
        status: 'connected',
        ...(pageId ? { pageId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!connection) {
      return NextResponse.json({ ok: false, error: 'No active Meta connection found' }, { status: 404 })
    }

    const selectedPageId = pageId || connection.pageId
    const pageToken = await getDecryptedPageToken(connection.id)
    if (!pageToken) {
      return NextResponse.json({ ok: false, error: 'Missing page access token' }, { status: 500 })
    }

    const subscribed = await subscribePageToWebhook(selectedPageId, pageToken, ['leadgen'])

    await prisma.metaConnection.update({
      where: { id: connection.id },
      data: { triggerSubscribed: subscribed },
    })

    if (subscribed) {
      await prisma.metaLeadgenState.upsert({
        where: { workspaceId: connection.workspaceId ?? 1 },
        update: { webhookSubscribedAt: new Date(), selectedPageId },
        create: { workspaceId: connection.workspaceId ?? 1, webhookSubscribedAt: new Date(), selectedPageId },
      })
    }

    return NextResponse.json({
      ok: subscribed,
      subscribed,
      pageId: selectedPageId,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to subscribe' },
      { status: error.statusCode || 500 }
    )
  }
}
