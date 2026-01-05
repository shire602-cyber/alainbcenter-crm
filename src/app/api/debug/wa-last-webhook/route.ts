import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Debug endpoint to record and inspect the last WhatsApp webhook payload
 * 
 * POST: Store the raw webhook body
 * GET: Retrieve and analyze the most recent webhook
 */
export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text()
    
    // Store in ExternalEventLog
    await prisma.externalEventLog.create({
      data: {
        provider: 'whatsapp',
        externalId: `debug-wa-last-${Date.now()}`,
        payload: rawText,
        receivedAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[DEBUG] Failed to store webhook debug record', error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET: Retrieve the most recent debug webhook and analyze it
 */
export async function GET(req: NextRequest) {
  try {
    // Fetch the most recent ExternalEventLog where externalId starts with 'debug-wa-last-'
    const latest = await prisma.externalEventLog.findFirst({
      where: {
        provider: 'whatsapp',
        externalId: {
          startsWith: 'debug-wa-last-',
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
      select: {
        id: true,
        externalId: true,
        payload: true,
        receivedAt: true,
      },
    })

    if (!latest) {
      return NextResponse.json({
        found: false,
        message: 'No debug webhook records found. Send an inbound message first.',
      })
    }

    // Parse payload if it's a string
    let payloadStr = ''
    try {
      payloadStr = typeof latest.payload === 'string' 
        ? latest.payload 
        : JSON.stringify(latest.payload)
    } catch {
      payloadStr = String(latest.payload || '')
    }

    // Analyze payload
    const containsMessages = payloadStr.includes('"messages"') || payloadStr.includes("'messages'")
    const containsStatuses = payloadStr.includes('"statuses"') || payloadStr.includes("'statuses'")
    
    // Try to parse JSON and extract more details
    let parsed: any = null
    let messagesCount = 0
    let statusesCount = 0
    let messageIds: string[] = []
    
    try {
      parsed = JSON.parse(payloadStr)
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
      // Not valid JSON, that's okay
    }

    return NextResponse.json({
      found: true,
      receivedAt: latest.receivedAt.toISOString(),
      externalId: latest.externalId,
      payloadLength: payloadStr.length,
      payloadSampleFirst2000Chars: payloadStr.substring(0, 2000),
      containsMessages,
      containsStatuses,
      messagesCount,
      statusesCount,
      messageIds,
      parsed: !!parsed,
      hasEntry: !!parsed?.entry,
      hasChanges: !!parsed?.entry?.[0]?.changes,
      hasValue: !!parsed?.entry?.[0]?.changes?.[0]?.value,
    })
  } catch (error: any) {
    console.error('[DEBUG] Failed to retrieve webhook debug record', error)
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 }
    )
  }
}

