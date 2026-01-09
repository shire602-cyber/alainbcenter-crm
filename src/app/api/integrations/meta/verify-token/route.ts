/**
 * GET /api/integrations/meta/verify-token
 * Get webhook verify token for manual setup
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'
import { getWebhookUrl } from '@/lib/publicUrl'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const verifyToken = await getWebhookVerifyToken()
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    if (!verifyToken) {
      return NextResponse.json({
        success: false,
        verifyToken: null,
        source: 'none',
        webhookUrl,
        error: 'Verify token not configured',
        instructions: [
          'Connect Meta integration first to generate a verify token',
          'Or set META_VERIFY_TOKEN environment variable',
        ],
      })
    }

    return NextResponse.json({
      success: true,
      verifyToken,
      source: 'database', // Always from database now (Integration table)
      webhookUrl,
      instructions: [
        'Copy the verify token above',
        'Go to Meta Developers → Your App → Instagram → Webhooks',
        `Set Callback URL to: ${webhookUrl}`,
        `Set Verify Token to: ${verifyToken}`,
        'Subscribe to: messages, messaging_postbacks',
        'Click "Verify and Save"',
      ],
    })
  } catch (error: any) {
    console.error('Get verify token error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get verify token',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

