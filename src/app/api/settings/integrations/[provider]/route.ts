import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/settings/integrations/:provider
 * Updates integration config and/or enabled status
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const provider = resolvedParams.provider

    const body = await req.json()
    const { enabled, config, ...otherFields } = body

    // Find integration by name (provider is the integration name)
    const existing = await prisma.integration.findUnique({
      where: { name: provider },
    })

    if (!existing) {
      return NextResponse.json(
        { error: `Integration "${provider}" not found` },
        { status: 404 }
      )
    }

    // Validate WhatsApp-specific fields if enabled
    if (provider === 'whatsapp' && enabled) {
      const whatsappConfig = config || {}
      const requiredFields: string[] = []

      // Meta Cloud API requires phoneNumberId and accessToken
      if (existing.provider === 'Meta Cloud API' || existing.provider === 'meta') {
        if (!whatsappConfig.phoneNumberId && !otherFields.phoneNumberId) {
          requiredFields.push('phoneNumberId')
        }
        if (!whatsappConfig.accessToken && !otherFields.accessToken && !existing.apiKey) {
          requiredFields.push('accessToken')
        }
      }

      // 360dialog requires apiKey
      if (existing.provider === '360dialog' && !existing.apiKey && !otherFields.apiKey) {
        requiredFields.push('apiKey')
      }

      if (requiredFields.length > 0) {
        return NextResponse.json(
          {
            error: `Missing required fields: ${requiredFields.join(', ')}`,
            requiredFields,
          },
          { status: 400 }
        )
      }
    }

    // Prepare update data
    const updateData: any = {}

    if (enabled !== undefined) {
      updateData.isEnabled = enabled
    }

    // Merge config with other fields
    const mergedConfig = { ...(existing.config ? JSON.parse(existing.config) : {}), ...config }
    
    // Handle WhatsApp-specific fields
    if (provider === 'whatsapp') {
      if (otherFields.phoneNumberId !== undefined) {
        mergedConfig.phoneNumberId = otherFields.phoneNumberId
      }
      if (otherFields.businessAccountId !== undefined) {
        mergedConfig.businessAccountId = otherFields.businessAccountId // App ID
      }
      if (otherFields.accessToken !== undefined) {
        mergedConfig.accessToken = otherFields.accessToken
        // Also store in apiKey for backward compatibility
        updateData.apiKey = otherFields.accessToken
      }
      if (otherFields.webhookVerifyToken !== undefined) {
        mergedConfig.webhookVerifyToken = otherFields.webhookVerifyToken
      }
      // App Secret from config or apiSecret field
      if (config?.appSecret !== undefined) {
        mergedConfig.appSecret = config.appSecret
      }
      // Ensure apiSecret is stored in the apiSecret field as well
      if (otherFields.apiSecret !== undefined) {
        updateData.apiSecret = otherFields.apiSecret
        mergedConfig.appSecret = otherFields.apiSecret
      }
    }

    // Update config JSON
    updateData.config = JSON.stringify(mergedConfig)

    // Update other standard fields
    if (otherFields.provider !== undefined) {
      updateData.provider = otherFields.provider
    }
    if (otherFields.apiKey !== undefined) {
      updateData.apiKey = otherFields.apiKey
    }
    if (otherFields.apiSecret !== undefined) {
      updateData.apiSecret = otherFields.apiSecret
    }
    if (otherFields.webhookUrl !== undefined) {
      updateData.webhookUrl = otherFields.webhookUrl
    }
    if (otherFields.accessToken !== undefined && provider !== 'whatsapp') {
      updateData.accessToken = otherFields.accessToken
    }

    const updated = await prisma.integration.update({
      where: { name: provider },
      data: updateData,
    })

    // Parse config for response
    let responseConfig = {}
    try {
      responseConfig = updated.config ? JSON.parse(updated.config) : {}
    } catch {
      responseConfig = {}
    }

    return NextResponse.json({
      ...updated,
      config: responseConfig,
    })
  } catch (error: any) {
    console.error('POST /api/settings/integrations/[provider] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update integration' },
      { status: error.statusCode || 500 }
    )
  }
}
