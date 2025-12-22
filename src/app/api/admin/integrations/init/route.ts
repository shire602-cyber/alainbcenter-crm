import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/admin/integrations/init
// Initialize default integrations if they don't exist
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const defaultIntegrations = [
      {
        name: 'whatsapp',
        provider: '360dialog',
        isEnabled: false,
      },
      {
        name: 'email',
        provider: 'SMTP',
        isEnabled: false,
      },
      {
        name: 'facebook',
        provider: 'Meta Lead Ads',
        isEnabled: false,
      },
      {
        name: 'instagram',
        provider: 'Meta Lead Ads',
        isEnabled: false,
      },
      {
        name: 'openai',
        provider: 'OpenAI API',
        isEnabled: false,
      },
    ]

    const results = []

    for (const integration of defaultIntegrations) {
      try {
        const result = await prisma.integration.upsert({
          where: { name: integration.name },
          update: {
            // Don't overwrite existing settings, just ensure it exists
            provider: integration.provider,
          },
          create: integration,
        })
        results.push({
          name: integration.name,
          action: 'created',
          integration: result,
        })
      } catch (error: any) {
        results.push({
          name: integration.name,
          action: 'error',
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Integrations initialized',
      results,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to initialize integrations' },
      { status: error.statusCode || 500 }
    )
  }
}






















