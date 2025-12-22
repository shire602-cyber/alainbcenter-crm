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

    // Check if user wants full token (for debugging)
    const showFull = req.nextUrl.searchParams.get('full') === 'true'

    return NextResponse.json({
      success: true,
      verifyTokenConfigured: !!verifyToken,
      verifyToken: showFull && verifyToken ? verifyToken : null, // Show full token only if requested
      verifyTokenPreview: verifyToken ? `${verifyToken.substring(0, 10)}...${verifyToken.substring(verifyToken.length - 5)}` : null,
      verifyTokenLength: verifyToken?.length || 0,
      integrationExists: !!integration,
      integrationEnabled: integration?.isEnabled || false,
      source: verifyToken ? (integration?.config ? 'integration_config' : 'env_var') : 'none',
      webhookUrl: process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/webhooks/whatsapp`
        : 'https://your-app.vercel.app/api/webhooks/whatsapp',
      instructions: {
        step1: showFull 
          ? 'Copy the verify token above and paste it in Meta'
          : 'Add ?full=true to the URL to see the full verify token',
        step2: 'Paste it in Meta Business Manager → WhatsApp → Configuration → Webhooks → Verify Token',
        step3: 'Use your Vercel deployment URL + /api/webhooks/whatsapp as Callback URL',
        step4: 'Click "Verify and Save"',
        troubleshooting: 'If verification fails, make sure the token in Meta exactly matches the token shown here',
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












