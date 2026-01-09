/**
 * GET /api/integrations/meta/status
 * Get current Meta connection status
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections } from '@/server/integrations/meta/storage'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'
import { getWebhookUrl } from '@/lib/publicUrl'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    // Get active connections from MetaConnection table (runtime status)
    const connections = await getAllConnections(null) // Single-tenant, use null
    
    // Get persisted config from Integration table (UI persistence)
    let persistedConfig = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'instagram-messaging' },
        select: { config: true, isEnabled: true },
      })

      if (integration?.config) {
        try {
          const config = JSON.parse(integration.config)
          persistedConfig = {
            pageId: config.pageId || null,
            pageName: config.pageName || null,
            igBusinessId: config.igBusinessId || null,
            igUsername: config.igUsername || null,
            connectedAt: config.connectedAt || null,
          }
        } catch (e) {
          console.warn('Failed to parse Integration config:', e)
        }
      }
    } catch (error: any) {
      console.warn('Failed to read Integration config:', error.message)
    }

    const webhookVerifyToken = await getWebhookVerifyToken()
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    return NextResponse.json({
      success: true,
      webhookUrl,
      webhookVerifyTokenConfigured: !!webhookVerifyToken,
      persistedConfig, // Config from Integration table (which page/IG was selected)
      activeConnections: connections.map((conn) => ({
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
      // Legacy: keep 'connections' for backward compatibility
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

