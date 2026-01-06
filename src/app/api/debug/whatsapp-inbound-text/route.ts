import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Ensure Node.js runtime
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/whatsapp-inbound-text
 * 
 * View the last 50 inbound WhatsApp text messages.
 * Helps diagnose whether messages are being saved to the database.
 */
export async function GET(req: NextRequest) {
  try {
    const messages = await prisma.message.findMany({
      where: {
        channel: 'whatsapp',
        direction: 'INBOUND',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        providerMessageId: true,
        type: true,
        body: true,
      },
    })

    const items = messages.map((msg) => ({
      id: msg.id,
      createdAt: msg.createdAt.toISOString(),
      providerMessageId: msg.providerMessageId,
      type: msg.type,
      body: msg.body ? msg.body.slice(0, 80) : null,
    }))

    const newestCreatedAt = messages.length > 0 
      ? messages[0].createdAt.toISOString() 
      : null

    return NextResponse.json({
      total: messages.length,
      newestCreatedAt,
      items,
    })
  } catch (e: any) {
    console.error('[DEBUG] Failed to fetch inbound messages', e)
    return NextResponse.json(
      { error: 'Failed to fetch messages', message: e.message },
      { status: 500 }
    )
  }
}

