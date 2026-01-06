import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Ensure Node.js runtime
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/whatsapp-webhooks
 * 
 * View the last 50 WhatsApp webhook deliveries recorded by the webhook tap.
 * Helps diagnose whether webhooks are hitting the server.
 */
export async function GET(req: NextRequest) {
  try {
    const logs = await prisma.externalEventLog.findMany({
      where: {
        provider: 'whatsapp',
      },
      orderBy: {
        receivedAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        externalId: true,
        receivedAt: true,
        payload: true,
      },
    })

    const items = logs.map((log) => {
      let payloadSample = ''
      let payloadLength = 0
      
      try {
        if (log.payload) {
          payloadLength = typeof log.payload === 'string' 
            ? log.payload.length 
            : JSON.stringify(log.payload).length
          const payloadStr = typeof log.payload === 'string' 
            ? log.payload 
            : JSON.stringify(log.payload)
          payloadSample = payloadStr.slice(0, 300)
        }
      } catch (e) {
        payloadSample = '[unparseable]'
      }

      return {
        id: log.id,
        externalId: log.externalId,
        receivedAt: log.receivedAt.toISOString(),
        payloadLength,
        payloadSample,
      }
    })

    const newestReceivedAt = logs.length > 0 
      ? logs[0].receivedAt.toISOString() 
      : null

    return NextResponse.json({
      total: logs.length,
      newestReceivedAt,
      items,
    })
  } catch (e: any) {
    console.error('[DEBUG] Failed to fetch webhook logs', e)
    return NextResponse.json(
      { error: 'Failed to fetch logs', message: e.message },
      { status: 500 }
    )
  }
}

