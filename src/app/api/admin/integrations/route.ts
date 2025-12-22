import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()
    const integrations = await prisma.integration.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(integrations)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch integrations' },
      { status: error.statusCode || 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()
    const body = await req.json()
    const { name, provider, apiKey, apiSecret, webhookUrl, accessToken, config, enabled } = body

    if (!name || !provider) {
      return NextResponse.json(
        { error: 'Name and provider are required' },
        { status: 400 }
      )
    }

    // Handle config as JSON object
    let configJson = config
    if (typeof config === 'object') {
      configJson = JSON.stringify(config)
    } else if (config && typeof config === 'string') {
      // Already a string, validate it's valid JSON
      try {
        JSON.parse(config)
        configJson = config
      } catch {
        configJson = JSON.stringify({ raw: config })
      }
    } else {
      configJson = null
    }

    const integration = await prisma.integration.upsert({
      where: { name },
      update: {
        provider,
        apiKey: apiKey || null,
        apiSecret: apiSecret || null,
        webhookUrl: webhookUrl || null,
        accessToken: accessToken || null,
        config: configJson,
        isEnabled: enabled !== undefined ? enabled : true,
      },
      create: {
        name,
        provider,
        apiKey: apiKey || null,
        apiSecret: apiSecret || null,
        webhookUrl: webhookUrl || null,
        accessToken: accessToken || null,
        config: configJson,
        isEnabled: enabled !== undefined ? enabled : true,
      },
    })

    return NextResponse.json(integration)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save integration' },
      { status: error.statusCode || 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminApi()
    const body = await req.json()
    const { name, provider, apiKey, apiSecret, webhookUrl, accessToken, config, enabled } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Integration name is required' },
        { status: 400 }
      )
    }

    const existing = await prisma.integration.findUnique({
      where: { name },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    const updateData: any = {}
    if (provider) updateData.provider = provider
    if (apiKey !== undefined) updateData.apiKey = apiKey || null
    if (apiSecret !== undefined) updateData.apiSecret = apiSecret || null
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl || null
    if (accessToken !== undefined) updateData.accessToken = accessToken || null
    if (enabled !== undefined) updateData.isEnabled = enabled

    // Handle config as JSON
    if (config !== undefined) {
      if (typeof config === 'object') {
        updateData.config = JSON.stringify(config)
      } else if (config === null || config === '') {
        updateData.config = null
      } else {
        // Try to parse existing config and merge
        let existingConfig = {}
        try {
          existingConfig = existing.config ? JSON.parse(existing.config) : {}
        } catch {}
        
        try {
          const parsed = JSON.parse(config as string)
          updateData.config = JSON.stringify({ ...existingConfig, ...parsed })
        } catch {
          updateData.config = config
        }
      }
    }

    const integration = await prisma.integration.update({
      where: { name },
      data: updateData,
    })

    return NextResponse.json(integration)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update integration' },
      { status: error.statusCode || 500 }
    )
  }
}

