import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/settings/whatsapp/test
 * Test WhatsApp Meta Cloud API connection
 * 
 * Tests:
 * 1. Meta Graph API connectivity with access token + phoneNumberId
 * 2. Webhook endpoint reachability (best effort)
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    // Get WhatsApp integration from DB
    const integration = await prisma.integration.findUnique({
      where: { name: 'whatsapp' },
    })

    if (!integration) {
      return NextResponse.json(
        { ok: false, error: 'WhatsApp integration not found. Please configure it first.' },
        { status: 404 }
      )
    }

    // Parse config
    let config: any = {}
    try {
      config = integration.config ? JSON.parse(integration.config) : {}
    } catch (e) {
      console.error('Failed to parse integration config:', e)
    }

    // Get credentials from config or integration fields
    const accessToken = config.accessToken || integration.accessToken || integration.apiKey
    const phoneNumberId = config.phoneNumberId
    const webhookVerifyToken = config.webhookVerifyToken
    const webhookUrl = integration.webhookUrl || config.webhookUrl

    // Validate required fields
    const missingFields: string[] = []
    if (!accessToken) missingFields.push('accessToken')
    if (!phoneNumberId) missingFields.push('phoneNumberId')

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields,
        },
        { status: 400 }
      )
    }

    const results: any = {
      ok: false,
      provider: 'meta_cloud',
      phoneNumberId,
      timestamp: new Date().toISOString(),
    }

    // Test 1: Meta Graph API
    try {
      const apiUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number,verified_name`
      
      const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const apiData = await apiResponse.json()

      if (apiResponse.ok && apiData) {
        results.ok = true
        results.api = {
          ok: true,
          display_phone_number: apiData.display_phone_number || null,
          verified_name: apiData.verified_name || null,
          phoneNumberId: apiData.id || phoneNumberId,
        }
      } else {
        // Handle Meta API errors
        const errorMessage = apiData.error?.message || 'Unknown error'
        const errorCode = apiData.error?.code || apiResponse.status
        const errorType = apiData.error?.type || 'unknown'

        // Map common errors to helpful hints
        let hint = ''
        if (errorMessage.includes('Invalid OAuth access token') || errorMessage.includes('access token')) {
          hint = 'Access token is invalid or expired. Generate a new permanent/long-lived token in Meta Business Manager.'
        } else if (errorCode === 100 || errorMessage.includes('does not exist') || errorMessage.includes('Unsupported get request')) {
          hint = 'Phone Number ID is incorrect or does not belong to this app. Verify it in Meta Business Manager → WhatsApp → API Setup.'
        } else if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
          hint = 'Token missing required permissions. Ensure your token has: whatsapp_business_messaging, whatsapp_business_management'
        } else if (errorType === 'OAuthException') {
          hint = 'OAuth authentication failed. Check your access token is valid and not expired.'
        }

        results.ok = false
        results.api = {
          ok: false,
          status: apiResponse.status,
          error: errorMessage,
          errorCode,
          errorType,
          hint,
        }
      }
    } catch (error: any) {
      results.ok = false
      results.api = {
        ok: false,
        error: error.message || 'Failed to connect to Meta Graph API',
        hint: 'Check your internet connection and verify Meta API endpoints are accessible.',
      }
    }

    // Test 2: Webhook reachability (best effort - don't fail if this fails)
    if (webhookUrl && webhookVerifyToken) {
      try {
        // Check if URL is publicly accessible (not localhost)
        const isPublic = webhookUrl && (
          webhookUrl.includes('vercel.app') ||
          webhookUrl.includes('vercel.com') ||
          webhookUrl.startsWith('https://') && !webhookUrl.includes('localhost') && !webhookUrl.includes('127.0.0.1')
        )

        if (isPublic) {
          const testChallenge = `test-${Date.now()}`
          const webhookTestUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken)}&hub.challenge=${testChallenge}`

          const webhookResponse = await fetch(webhookTestUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'WhatsApp-Test-Connection/1.0',
            },
            // Short timeout for webhook test
            signal: AbortSignal.timeout(5000),
          })

          const webhookBody = await webhookResponse.text()

          if (webhookResponse.ok && webhookBody === testChallenge) {
            results.webhook = {
              ok: true,
              url: webhookUrl,
              message: 'Webhook endpoint is reachable and responding correctly',
            }
          } else {
            results.webhook = {
              ok: false,
              url: webhookUrl,
              status: webhookResponse.status,
              response: webhookBody.substring(0, 200),
              reason: `Webhook returned status ${webhookResponse.status} or incorrect challenge response`,
              hint: 'Verify the webhook URL is correct and publicly accessible. If you\'re on Vercel, make sure you\'re using your production deployment URL.',
            }
          }
        } else {
          // Localhost or non-public URL detected
          const isVercel = process.env.VERCEL || process.env.VERCEL_URL
          results.webhook = {
            ok: false,
            url: webhookUrl,
            reason: isVercel 
              ? 'Webhook URL appears to be localhost. Update it to your Vercel deployment URL.'
              : 'Localhost URL cannot be tested externally. Deploy to Vercel or use a publicly accessible URL.',
            hint: isVercel
              ? `Your app is deployed on Vercel. Use your Vercel deployment URL (e.g., https://your-app.vercel.app/api/webhooks/whatsapp)`
              : 'Replace localhost with a publicly accessible URL (like your Vercel deployment URL).',
          }
        }
      } catch (error: any) {
        // Don't fail the whole test if webhook check fails
        results.webhook = {
          ok: false,
          url: webhookUrl,
          reason: error.message || 'Webhook endpoint is not reachable',
          hint: process.env.VERCEL || process.env.VERCEL_URL
            ? 'Verify the webhook URL points to your Vercel deployment and is publicly accessible.'
            : 'Verify the webhook URL is publicly accessible and points to your deployment.',
        }
      }
    } else {
      results.webhook = {
        ok: false,
        reason: 'Webhook URL or verify token not configured',
        hint: 'Configure webhook URL and verify token to test webhook reachability.',
      }
    }

    // Log test result
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'whatsapp',
          externalId: `test-${Date.now()}`,
          payload: JSON.stringify({
            api: results.api,
            webhook: results.webhook,
            phoneNumberId,
          }),
        },
      })
    } catch (e) {
      // Logging failure shouldn't break the test
      console.warn('Failed to log test result:', e)
    }

    // Return results
    if (results.ok) {
      return NextResponse.json(results)
    } else {
      return NextResponse.json(results, { status: 400 })
    }
  } catch (error: any) {
    console.error('POST /api/settings/whatsapp/test error:', error)

    // Log error
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'whatsapp',
          externalId: `test-error-${Date.now()}`,
          payload: JSON.stringify({ error: error.message }),
        },
      })
    } catch {}

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to test WhatsApp connection',
      },
      { status: error.statusCode || 500 }
    )
  }
}












