import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Debug endpoint to verify server time and recent ExternalEventLog/Message activity
 * 
 * GET: Returns server time and latest database records
 */
export async function GET(req: NextRequest) {
  try {
    const serverNow = new Date()
    
    // Fetch latest ExternalEventLog entries
    const latestExternalEvents = await prisma.externalEventLog.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: { 
        id: true, 
        provider: true, 
        externalId: true, 
        receivedAt: true,
      },
    })

    // Fetch latest Message rows
    const latestMessageRows = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { 
        id: true, 
        providerMessageId: true, 
        type: true, 
        body: true, 
        createdAt: true,
        providerMediaId: true,
      },
    })

    return NextResponse.json({
      serverNowIso: serverNow.toISOString(),
      serverNowMs: Date.now(),
      timezoneOffsetMinutes: serverNow.getTimezoneOffset(),
      latestExternalEvents: latestExternalEvents.map(event => ({
        id: event.id,
        provider: event.provider,
        externalId: event.externalId,
        receivedAt: event.receivedAt.toISOString(),
        receivedAtMs: event.receivedAt.getTime(),
        ageSeconds: Math.round((serverNow.getTime() - event.receivedAt.getTime()) / 1000),
      })),
      latestMessageRows: latestMessageRows.map(msg => ({
        id: msg.id,
        providerMessageId: msg.providerMessageId,
        type: msg.type,
        body: msg.body ? (msg.body.length > 100 ? msg.body.substring(0, 100) + '...' : msg.body) : null,
        bodyLength: msg.body?.length || 0,
        createdAt: msg.createdAt.toISOString(),
        createdAtMs: msg.createdAt.getTime(),
        ageSeconds: Math.round((serverNow.getTime() - msg.createdAt.getTime()) / 1000),
        hasProviderMediaId: !!msg.providerMediaId,
      })),
      summary: {
        totalExternalEvents: latestExternalEvents.length,
        totalMessageRows: latestMessageRows.length,
        newestExternalEventAgeSeconds: latestExternalEvents[0] 
          ? Math.round((serverNow.getTime() - latestExternalEvents[0].receivedAt.getTime()) / 1000)
          : null,
        newestMessageAgeSeconds: latestMessageRows[0]
          ? Math.round((serverNow.getTime() - latestMessageRows[0].createdAt.getTime()) / 1000)
          : null,
        hasRecentExternalEvents: latestExternalEvents[0] 
          ? (serverNow.getTime() - latestExternalEvents[0].receivedAt.getTime()) < 300000 // 5 minutes
          : false,
        hasRecentMessages: latestMessageRows[0]
          ? (serverNow.getTime() - latestMessageRows[0].createdAt.getTime()) < 300000 // 5 minutes
          : false,
      },
    })
  } catch (error: any) {
    console.error('[DEBUG] Failed to retrieve time and events', error)
    return NextResponse.json(
      { 
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

