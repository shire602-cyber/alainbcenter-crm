/**
 * GET /api/integrations/meta/test-webhook-verification
 * Test Meta webhook verification process by simulating Meta's verification request
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getWebhookUrl } from '@/lib/publicUrl'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const searchParams = req.nextUrl.searchParams
    const verifyToken = searchParams.get('verifyToken') || null
    
    const configuredVerifyToken = await getWebhookVerifyToken()
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    // Use provided token or fall back to configured token
    const testToken = verifyToken || configuredVerifyToken

    if (!testToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No verify token provided and none configured',
          hint: 'Either provide verifyToken query parameter or configure webhook verify token in Integration settings',
        },
        { status: 400 }
      )
    }

    // Test challenge value
    const testChallenge = `test-verification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Build verification URL with Meta's webhook verification parameters
    const verificationUrl = new URL(webhookUrl)
    verificationUrl.searchParams.set('hub.mode', 'subscribe')
    verificationUrl.searchParams.set('hub.verify_token', testToken)
    verificationUrl.searchParams.set('hub.challenge', testChallenge)

    let verificationResult = null
    let verificationError = null
    let verificationSuccess = false

    try {
      // Simulate Meta's verification request
      const response = await fetch(verificationUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Meta-Webhook-Verification-Test',
        },
      })

      const responseText = await response.text()

      verificationResult = {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        body: responseText,
        bodyLength: responseText.length,
        challengeMatch: responseText === testChallenge,
        isPlainText: response.headers.get('content-type')?.includes('text/plain'),
      }

      // Verification succeeds if:
      // 1. Status is 200
      // 2. Content-Type is text/plain
      // 3. Response body matches the challenge exactly
      verificationSuccess =
        response.status === 200 &&
        verificationResult?.challengeMatch === true &&
        verificationResult?.isPlainText === true
    } catch (error: any) {
      verificationError = error.message
      verificationSuccess = false
    }

    return NextResponse.json({
      success: true,
      webhookUrl,
      testChallenge,
      verifyTokenUsed: testToken,
      verifyTokenProvided: !!verifyToken,
      verifyTokenConfigured: !!configuredVerifyToken,
      verificationSuccess,
      verificationResult,
      verificationError,
      explanation: verificationSuccess
        ? '✅ Webhook verification test PASSED - Meta will be able to verify your webhook'
        : verificationError
        ? `❌ Webhook verification test FAILED - Error: ${verificationError}`
        : `❌ Webhook verification test FAILED - Response did not match expected format`,
      instructions: {
        note: 'This test simulates what Meta does when you click "Verify and Save" in Meta Developer Console',
        expectedBehavior: 'If this test passes, Meta\'s verification should also pass',
        ifTestFails: [
          'Check that the verify token matches exactly (case-sensitive)',
          'Check that the webhook endpoint is publicly accessible',
          'Check Vercel logs for any errors during verification',
          'Make sure the endpoint returns the challenge as plain text (not JSON)',
        ],
        metaConsoleSteps: [
          '1. Go to Meta Developers → Your App → Instagram → Webhooks',
          '2. Enter the Webhook URL shown above',
          '3. Enter the Verify Token shown above (use exact value, case-sensitive)',
          '4. Click "Verify and Save"',
          '5. Meta will make a GET request similar to this test',
          '6. If verification succeeds, the webhook will be active',
        ],
      },
    })
  } catch (error: any) {
    console.error('Test webhook verification error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}

