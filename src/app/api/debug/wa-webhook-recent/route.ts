import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Debug endpoint to view recent WhatsApp webhook logs
 * 
 * GET: Returns last 20 webhook logs from ExternalEventLog
 */
export async function GET(req: NextRequest) {
  try {
    // Fetch last 20 webhook logs
    const webhooks = await prisma.externalEventLog.findMany({
      where: {
        provider: 'whatsapp',
        externalId: {
          startsWith: 'webhook-',
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        receivedAt: true,
        provider: true,
        externalId: true,
        payload: true,
      },
    })

    // Map to JSON with analysis
    const mapped = webhooks.map((webhook) => {
      const payloadStr = typeof webhook.payload === 'string'
        ? webhook.payload
        : JSON.stringify(webhook.payload || '')
      
      const containsMessages = payloadStr.includes('"messages"') || payloadStr.includes("'messages'")
      const containsStatuses = payloadStr.includes('"statuses"') || payloadStr.includes("'statuses'")
      
      // Try to parse and extract counts
      let messagesCount = 0
      let statusesCount = 0
      let messageIds: string[] = []
      
      try {
        const parsed = JSON.parse(payloadStr)
        const entry = parsed?.entry?.[0]
        const changes = entry?.changes?.[0]
        const value = changes?.value
        
        if (value?.messages && Array.isArray(value.messages)) {
          messagesCount = value.messages.length
          messageIds = value.messages.map((m: any) => m?.id).filter(Boolean)
        }
        
        if (value?.statuses && Array.isArray(value.statuses)) {
          statusesCount = value.statuses.length
        }
      } catch {
        // Not valid JSON or parse failed
      }

      return {
        id: webhook.id,
        receivedAt: webhook.receivedAt.toISOString(),
        receivedAtMs: webhook.receivedAt.getTime(),
        provider: webhook.provider,
        externalId: webhook.externalId,
        payloadLength: payloadStr.length,
        payloadSample: payloadStr.slice(0, 500),
        containsMessages,
        containsStatuses,
        messagesCount,
        statusesCount,
        messageIds,
        ageSeconds: Math.round((Date.now() - webhook.receivedAt.getTime()) / 1000),
      }
    })

    return NextResponse.json({
      total: mapped.length,
      webhooks: mapped,
      summary: {
        totalWithMessages: mapped.filter(w => w.containsMessages).length,
        totalWithStatuses: mapped.filter(w => w.containsStatuses).length,
        totalWithBoth: mapped.filter(w => w.containsMessages && w.containsStatuses).length,
        totalMessagesOnly: mapped.filter(w => w.containsMessages && !w.containsStatuses).length,
        totalStatusesOnly: mapped.filter(w => !w.containsMessages && w.containsStatuses).length,
        newestAgeSeconds: mapped[0]?.ageSeconds || null,
      },
    })
  } catch (error: any) {
    console.error('[DEBUG] Failed to retrieve webhook logs', error)
    return NextResponse.json(
      {
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

