import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/whatsapp/config
 * Get WhatsApp configuration status (for Settings UI)
 * Returns which env vars are configured (without exposing values)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    // PRIORITY: Check Integration model first (database), then fallback to env vars
    let accessToken: string | null = null
    let phoneNumberId: string | null = null
    let verifyToken: string | null = null
    let appSecret: string | null = null

    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
      })

      if (integration) {
        // Get from config JSON
        if (integration.config) {
          try {
            const config = typeof integration.config === 'string'
              ? JSON.parse(integration.config)
              : integration.config
            
            accessToken = config.accessToken || integration.accessToken || integration.apiKey || null
            phoneNumberId = config.phoneNumberId || null
            verifyToken = config.webhookVerifyToken || null
            appSecret = integration.apiSecret || config.appSecret || null
          } catch (e) {
            console.warn('Failed to parse integration config:', e)
          }
        } else {
          // Fallback to direct fields
          accessToken = integration.accessToken || integration.apiKey || null
          appSecret = integration.apiSecret || null
        }
      }
    } catch (e) {
      console.warn('Could not fetch integration from DB:', e)
    }

    // Fallback to environment variables if not found in database
    if (!accessToken) accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null
    if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null
    if (!verifyToken) verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || null
    if (!appSecret) appSecret = process.env.WHATSAPP_APP_SECRET || null

    // Get last inbound message webhook event
    let lastInboundMessage = null
    let recentWebhookLogs: any[] = []
    
    try {
      // Get last inbound message (from Message table)
      const lastMessage = await prisma.message.findFirst({
          where: {
          channel: 'whatsapp',
          direction: 'INBOUND',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          body: true,
          createdAt: true,
          providerMessageId: true,
        },
      })

      if (lastMessage) {
        lastInboundMessage = {
          externalId: lastMessage.providerMessageId || `msg-${lastMessage.id}`,
          receivedAt: lastMessage.createdAt,
          body: lastMessage.body,
        }
      }

      // Get recent 10 webhook logs (including auto-reply logs)
      recentWebhookLogs = await prisma.externalEventLog.findMany({
        where: { 
          provider: { in: ['whatsapp', 'auto-reply'] }
        },
          orderBy: { receivedAt: 'desc' },
          take: 10,
        select: {
          id: true,
          externalId: true,
          provider: true,
          payload: true,
          receivedAt: true,
        },
        })
    } catch (error: any) {
      // Model might not exist yet - silently ignore
      console.warn('ExternalEventLog not available:', error?.message || 'Unknown error')
    }

    return NextResponse.json({
      configured: {
        accessToken: !!accessToken,
        phoneNumberId: !!phoneNumberId,
        verifyToken: !!verifyToken,
        appSecret: !!appSecret,
      },
      lastInboundMessage: lastInboundMessage
        ? {
            ok: true,
            kind: 'inbound',
            info: lastInboundMessage.body?.substring(0, 50) || lastInboundMessage.externalId,
            createdAt: lastInboundMessage.receivedAt.toISOString(),
          }
        : null,
      recentWebhookLogs: recentWebhookLogs.map(log => {
        let kind = 'unknown'
        let info = null
        let ok = true
        
        try {
          if (log.payload) {
            const payload = JSON.parse(log.payload)
            if (log.provider === 'auto-reply') {
              kind = payload.status || 'auto-reply'
              info = payload.reason || payload.error || `Lead ${payload.leadId}`
              ok = payload.status === 'success'
            } else {
              kind = 'webhook'
              info = log.externalId
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
        
        return {
        id: log.id,
        externalId: log.externalId,
        receivedAt: log.receivedAt,
          createdAt: log.receivedAt.toISOString(),
          kind,
          info,
          ok,
        }
      }),
    })
  } catch (error: any) {
    console.error('GET /api/whatsapp/config error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load config' },
      { status: error.statusCode || 500 }
    )
  }
}
