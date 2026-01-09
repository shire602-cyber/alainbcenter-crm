import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/whatsapp/test-manual
 * Manual test endpoint to verify webhook is working
 * Use this URL in your browser to test:
 * https://your-app.vercel.app/api/webhooks/whatsapp/test-manual?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123
 */
export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get('hub.mode') || 'subscribe'
    const token = req.nextUrl.searchParams.get('hub.verify_token') || req.nextUrl.searchParams.get('token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge') || 'test123'

    // Get verify token from database
    let verifyToken: string | null = null
    let integration = null

    try {
      integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          verifyToken = config.webhookVerifyToken || null
        } catch (e) {
          console.error('Config parse error:', e)
        }
      }
    } catch (e) {
      console.error('Integration fetch error:', e)
    }

    // Fallback to env var
    if (!verifyToken) {
      verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || null
    }

    const cleanedToken = token?.trim()
    const cleanedVerifyToken = verifyToken?.trim()

    const response = {
      success: true,
      test: true,
      request: {
        mode,
        tokenProvided: !!token,
        challengeProvided: !!challenge,
        tokenLength: token?.length || 0,
        token: token ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}` : null,
      },
      expected: {
        verifyTokenExists: !!verifyToken,
        verifyTokenLength: verifyToken?.length || 0,
        verifyToken: verifyToken ? `${verifyToken.substring(0, 5)}...${verifyToken.substring(verifyToken.length - 5)}` : null,
        source: verifyToken ? (integration?.config ? 'database' : 'env') : 'none',
      },
      comparison: {
        tokensMatch: cleanedToken === cleanedVerifyToken,
        modeMatches: mode === 'subscribe',
        willVerify: mode === 'subscribe' && cleanedToken && cleanedVerifyToken && cleanedToken === cleanedVerifyToken,
      },
      challenge: challenge,
    }

    // If verification would succeed, return challenge like the real endpoint
    if (mode === 'subscribe' && cleanedToken && cleanedVerifyToken && cleanedToken === cleanedVerifyToken) {
      return new Response(challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Otherwise return JSON with details
    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

