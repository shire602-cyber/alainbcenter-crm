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

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
    const appSecret = process.env.WHATSAPP_APP_SECRET

    // Get last inbound message webhook event
    let lastInboundMessage = null
    let recentWebhookLogs: any[] = []
    
    try {
      const webhookModel = prisma.externalEventLog
      if (webhookModel && typeof webhookModel.findFirst === 'function') {
        // Get last inbound message
        lastInboundMessage = await webhookModel.findFirst({
          where: {
            provider: 'whatsapp',
            externalId: { contains: 'msg-' },
          },
          orderBy: { receivedAt: 'desc' },
        })

        // Get recent 10 webhook logs
        recentWebhookLogs = await webhookModel.findMany({
          where: { provider: 'whatsapp' },
          orderBy: { receivedAt: 'desc' },
          take: 10,
        })
      }
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
            externalId: lastInboundMessage.externalId,
            receivedAt: lastInboundMessage.receivedAt,
          }
        : null,
      recentWebhookLogs: recentWebhookLogs.map(log => ({
        id: log.id,
        externalId: log.externalId,
        receivedAt: log.receivedAt,
      })),
    })
  } catch (error: any) {
    console.error('GET /api/whatsapp/config error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load config' },
      { status: error.statusCode || 500 }
    )
  }
}
