/**
 * GET /api/integrations/meta/test-webhook-url
 * Test if webhook URL is accessible and correctly configured
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getWebhookUrl } from '@/lib/publicUrl'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)
    const verifyToken = await getWebhookVerifyToken()

    // Test if webhook endpoint is reachable
    let webhookAccessible = false
    let webhookResponse: { status: number; statusText: string; body?: any } | null = null
    let webhookError = null

    try {
      // Test healthcheck (GET request without hub params)
      const testResponse = await fetch(webhookUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Meta-Webhook-URL-Test',
        },
      })
      webhookAccessible = testResponse.ok
      const responseBody = await testResponse.text()
      let parsedBody: any
      try {
        parsedBody = JSON.parse(responseBody)
      } catch {
        parsedBody = responseBody
      }
      webhookResponse = {
        status: testResponse.status,
        statusText: testResponse.statusText,
        body: parsedBody,
      }
    } catch (error: any) {
      webhookError = error.message
      webhookAccessible = false
    }

    // Get environment information
    const envInfo = {
      VERCEL_URL: process.env.VERCEL_URL || 'NOT SET',
      APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || 'NOT SET',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
      requestOrigin: req.headers.get('origin') || 'NOT SET',
      requestHost: req.headers.get('host') || 'NOT SET',
    }

    return NextResponse.json({
      success: true,
      webhookUrl,
      verifyToken: verifyToken || 'NOT SET',
      verifyTokenConfigured: !!verifyToken,
      webhookAccessible,
      webhookResponse,
      webhookError,
      environment: envInfo,
      instructions: {
        webhookUrl: 'Copy this URL and paste it in Meta Developer Console → Your App → Instagram → Webhooks → Callback URL',
        verifyToken: 'Copy this token and paste it in Meta Developer Console → Your App → Instagram → Webhooks → Verify Token',
        subscribedFields: ['messages', 'messaging_postbacks'],
        note: 'Make sure the webhook URL is HTTPS (not HTTP) and publicly accessible. Meta will not send webhooks to localhost or private IPs.',
      },
    })
  } catch (error: any) {
    console.error('Test webhook URL error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}

