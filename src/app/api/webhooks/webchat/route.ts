/**
 * POST /api/webhooks/webchat
 * 
 * Handle inbound website chat messages
 * 
 * This endpoint accepts messages from website chat widgets.
 * Can be called directly from frontend JavaScript or from chat service providers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleInboundMessage } from '@/lib/inbound'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Expected payload structure:
    // {
    //   sessionId: string (or email if user provided it)
    //   name?: string
    //   email?: string
    //   message: string
    //   timestamp?: number
    // }

    const sessionId = body.sessionId || body.session_id || body.id || `webchat_${Date.now()}`
    const name = body.name || body.userName || 'Website Visitor'
    const email = body.email || null
    const messageText = body.message || body.text || body.body || ''
    const timestamp = body.timestamp 
      ? new Date(body.timestamp * 1000) 
      : body.date 
        ? new Date(body.date) 
        : new Date()

    if (!messageText) {
      return NextResponse.json(
        { error: 'Message text is required' },
        { status: 400 }
      )
    }

    // Use email if provided, otherwise use sessionId as identifier
    const fromAddress = email || sessionId

    // Use common inbound handler
    const result = await handleInboundMessage({
      channel: 'WEBCHAT',
      externalId: sessionId, // Use session ID as conversation external ID
      externalMessageId: `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAddress: fromAddress,
      fromName: name,
      body: messageText,
      rawPayload: body,
      receivedAt: timestamp,
    })

    console.log(`✅ Processed webchat message from ${fromAddress}`)

    return NextResponse.json({ 
      ok: true,
      messageId: result.message.id,
    })
  } catch (error: any) {
    console.error('❌ Error processing webchat message:', error)
    return NextResponse.json(
      { 
        ok: false,
        error: error.message || 'Internal server error' 
      },
      { status: 500 }
    )
  }
}
