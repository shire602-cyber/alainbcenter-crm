import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/whatsapp/debug
 * Debug endpoint to see exactly what the webhook endpoint sees
 */
export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')

    // Get verify token from Integration
    let verifyToken: string | null = null
    let integration = null
    let configRaw: any = null
    let configParsed: any = null

    try {
      integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
      })

      if (integration) {
        configRaw = integration.config
        if (integration.config) {
          try {
            configParsed = typeof integration.config === 'string'
              ? JSON.parse(integration.config)
              : integration.config
            verifyToken = configParsed?.webhookVerifyToken || null
          } catch (e) {
            console.error('Config parse error:', e)
          }
        }
      }
    } catch (e: any) {
      console.error('Integration fetch error:', e)
    }

    // Fallback to env var
    const envToken = process.env.WHATSAPP_VERIFY_TOKEN || null

    // Compare tokens character by character
    const tokenComparison = {
      fromMeta: token ? {
        value: token,
        length: token.length,
        first5: token.substring(0, 5),
        last5: token.substring(token.length - 5),
        chars: token.split('').map((c, i) => ({ index: i, char: c, code: c.charCodeAt(0) })),
      } : null,
      fromDatabase: verifyToken ? {
        value: verifyToken,
        length: verifyToken.length,
        first5: verifyToken.substring(0, 5),
        last5: verifyToken.substring(verifyToken.length - 5),
        chars: verifyToken.split('').map((c, i) => ({ index: i, char: c, code: c.charCodeAt(0) })),
      } : null,
      fromEnv: envToken ? {
        value: envToken,
        length: envToken.length,
        first5: envToken.substring(0, 5),
        last5: envToken.substring(envToken.length - 5),
      } : null,
      match: token === verifyToken,
      matchEnv: token === envToken,
    }

    return NextResponse.json({
      success: true,
      request: {
        mode,
        tokenProvided: !!token,
        challengeProvided: !!challenge,
        url: req.url,
        queryString: req.nextUrl.search,
      },
      integration: {
        exists: !!integration,
        id: integration?.id,
        name: integration?.name,
        isEnabled: integration?.isEnabled,
        configRaw: configRaw ? (typeof configRaw === 'string' ? configRaw.substring(0, 200) : JSON.stringify(configRaw).substring(0, 200)) : null,
        configParsed: configParsed,
        webhookVerifyToken: verifyToken,
      },
      tokens: {
        fromDatabase: verifyToken,
        fromEnv: envToken,
        used: verifyToken || envToken || null,
        source: verifyToken ? 'database' : (envToken ? 'env' : 'none'),
      },
      comparison: tokenComparison,
      willVerify: mode === 'subscribe' && (token === verifyToken || token === envToken),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelUrl: process.env.VERCEL_URL,
        hasDatabase: !!process.env.DATABASE_URL,
      },
    })
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

