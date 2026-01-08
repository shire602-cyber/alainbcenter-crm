/**
 * POST /api/integrations/meta/disconnect
 * Disconnect Meta integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { deleteConnection, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { unsubscribePageFromWebhook } from '@/server/integrations/meta/subscribe'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { connectionId } = body

    if (!connectionId || typeof connectionId !== 'number') {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      )
    }

    // Get connection to find page ID and token for unsubscribe
    const { prisma } = await import('@/lib/prisma')
    const connection = await prisma.metaConnection.findUnique({
      where: { id: connectionId },
      select: { pageId: true, pageAccessToken: true },
    })

    // Unsubscribe from webhook if we have the connection
    if (connection) {
      try {
        const pageToken = await getDecryptedPageToken(connectionId)
        if (pageToken) {
          await unsubscribePageFromWebhook(connection.pageId, pageToken)
        }
      } catch (error: any) {
        console.error('Failed to unsubscribe from webhook:', error)
        // Continue with deletion even if unsubscribe fails
      }
    }

    // Delete connection
    await deleteConnection(connectionId)

    return NextResponse.json({
      success: true,
      message: 'Disconnected successfully',
    })
  } catch (error: any) {
    console.error('Meta disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect', details: error.message },
      { status: 500 }
    )
  }
}

