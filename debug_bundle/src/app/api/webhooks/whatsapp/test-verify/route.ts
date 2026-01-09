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

    // PRIORITY: Environment variable first (most reliable)
    if (!verifyToken) {
      verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || null
      if (verifyToken) {
        console.log('✅ Using verify token from environment variable WHATSAPP_VERIFY_TOKEN')
      }
    }

    // Get Vercel URL from environment or use the request host
    const getWebhookUrl = () => {
      if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}/api/webhooks/whatsapp`
      }
      if (process.env.NEXT_PUBLIC_APP_URL) {
        return `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`
      }
      // Fallback to current request host
      const host = req.headers.get('host')
      if (host) {
        return `https://${host}/api/webhooks/whatsapp`
      }
      return 'https://your-app.vercel.app/api/webhooks/whatsapp'
    }

    return NextResponse.json({
      success: true,
      verifyTokenConfigured: !!verifyToken,
      verifyToken: verifyToken || null, // Always show the full token
      verifyTokenLength: verifyToken?.length || 0,
      integrationExists: !!integration,
      integrationEnabled: integration?.isEnabled || false,
      source: verifyToken ? (integration?.config ? 'integration_config' : 'env_var') : 'none',
      webhookUrl: getWebhookUrl(),
      instructions: {
        step1: verifyToken
          ? `Copy this EXACT token and paste it in Meta: ${verifyToken}`
          : 'No verify token configured. Set it in /admin/integrations or via WHATSAPP_VERIFY_TOKEN env var',
        step2: 'Go to Meta Business Manager → WhatsApp → Configuration → Webhooks',
        step3: `Set Callback URL to: ${getWebhookUrl()}`,
        step4: `Set Verify Token to: ${verifyToken || '(not configured)'}`,
        step5: 'Click "Verify and Save"',
        troubleshooting: 'If verification fails, ensure the token in Meta exactly matches the "verifyToken" field above',
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












