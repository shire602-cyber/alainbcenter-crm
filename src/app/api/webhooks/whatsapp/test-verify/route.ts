import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/webhooks/whatsapp/test-verify
 * Test endpoint to check webhook verification setup
 * This helps debug verification issues
 */
export async function GET(req: NextRequest) {
  try {
    // Get verify token from Integration
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

    return NextResponse.json({
      success: true,
      verifyTokenConfigured: !!verifyToken,
      verifyTokenPreview: verifyToken ? `${verifyToken.substring(0, 10)}...${verifyToken.substring(verifyToken.length - 5)}` : null,
      verifyTokenLength: verifyToken?.length || 0,
      integrationExists: !!integration,
      integrationEnabled: integration?.isEnabled || false,
      source: verifyToken ? (integration?.config ? 'integration_config' : 'env_var') : 'none',
      instructions: {
        step1: 'Copy the verify token shown above',
        step2: 'Paste it in Meta Business Manager → WhatsApp → Configuration → Webhooks → Verify Token',
        step3: 'Use your ngrok HTTPS URL + /api/webhooks/whatsapp as Callback URL',
        step4: 'Click "Verify and Save"',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}











