/**
 * POST /api/webhooks/email
 * 
 * Handle inbound email messages
 * 
 * This endpoint accepts email webhooks from email providers (SendGrid, Mailgun, etc.)
 * or can be called directly for testing.
 * 
 * TODO: Implement provider-specific parsing based on your email service:
 * - SendGrid: https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
 * - Mailgun: https://documentation.mailgun.com/en/latest/user_manual.html#receiving-messages
 * - AWS SES: https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-lambda.html
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleInboundMessage } from '@/lib/inbound'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // TODO: Parse email payload based on your provider
    // Example structure (adjust based on your email service):
    const fromEmail = body.from || body.sender || body.envelope?.from || ''
    const fromName = body.from_name || body.sender_name || ''
    const subject = body.subject || ''
    const textBody = body.text || body['body-plain'] || body.text_body || ''
    const htmlBody = body.html || body['body-html'] || body.html_body || ''
    const messageId = body.message_id || body['Message-Id'] || body.messageId || `email_${Date.now()}`
    const threadId = body.thread_id || body['In-Reply-To'] || body.references || null
    const timestamp = body.timestamp 
      ? new Date(body.timestamp * 1000) 
      : body.date 
        ? new Date(body.date) 
        : new Date()

    // Use text body, fallback to HTML stripped
    let messageBody = textBody
    if (!messageBody && htmlBody) {
      // Basic HTML stripping (for production, use a proper HTML parser)
      messageBody = htmlBody
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
    }

    if (!messageBody) {
      messageBody = `[Email: ${subject || 'No subject'}]`
    }

    if (!fromEmail) {
      return NextResponse.json(
        { error: 'Missing sender email address' },
        { status: 400 }
      )
    }

    // Use common inbound handler
    const result = await handleInboundMessage({
      channel: 'EMAIL',
      externalId: threadId, // Email thread ID
      externalMessageId: messageId,
      fromAddress: fromEmail,
      fromName: fromName,
      body: messageBody,
      rawPayload: body,
      receivedAt: timestamp,
    })

    console.log(`✅ Processed inbound email ${messageId} from ${fromEmail}`)

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('❌ Error processing email webhook:', error)
    // Still return 200 to prevent retries
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

