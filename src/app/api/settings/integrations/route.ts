import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/settings/integrations
 * Returns all integrations with their current config and enabled state
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const integrations = await prisma.integration.findMany({
      orderBy: { name: 'asc' },
    })

    const integrationsWithConfig = integrations.map((integration) => {
      let config = {}
      try {
        config = integration.config ? JSON.parse(integration.config) : {}
      } catch {
        config = {}
      }

      return {
        ...integration,
        config,
      }
    })

    return NextResponse.json(integrationsWithConfig)
  } catch (error: any) {
    console.error('GET /api/settings/integrations error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch integrations' },
      { status: error.statusCode || 500 }
    )
  }
}

