/**
 * GET /api/integrations/meta/status
 * Get current Meta connection status
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections } from '@/server/integrations/meta/storage'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'
import { getWebhookUrl } from '@/lib/publicUrl'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const connections = await getAllConnections(null) // Single-tenant, use null
    const webhookVerifyToken = await getWebhookVerifyToken()
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    return NextResponse.json({
      success: true,
      webhookUrl,
      webhookVerifyTokenConfigured: !!webhookVerifyToken,
      connections: connections.map((conn) => ({
        id: conn.id,
        pageId: conn.pageId,
        pageName: conn.pageName,
        igUsername: conn.igUsername,
        igBusinessId: conn.igBusinessId,
        triggerSubscribed: conn.triggerSubscribed,
        status: conn.status,
        lastError: conn.lastError,
        createdAt: conn.createdAt.toISOString(),
        updatedAt: conn.updatedAt.toISOString(),
      })),
    })
  } catch (error: any) {
    console.error('Meta status error:', error)
    return NextResponse.json(
      { error: 'Failed to get status', details: error.message },
      { status: 500 }
    )
  }
}

