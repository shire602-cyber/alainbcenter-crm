/**
 * GET/POST /api/admin/ai/service-prompts
 * 
 * Manage service-specific AI prompts (Phase 5)
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { getAllServicePromptConfigs, saveServicePromptConfig } from '@/lib/ai/servicePrompts'

/**
 * GET - Get all service prompt configs
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const configs = await getAllServicePromptConfigs()

    return NextResponse.json({
      ok: true,
      configs,
    })
  } catch (error: any) {
    console.error('Error fetching service prompt configs:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to fetch service prompt configs',
      },
      { status: 500 }
    )
  }
}

/**
 * POST - Save service prompt config
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { serviceType, config } = body

    if (!serviceType || !config) {
      return NextResponse.json(
        {
          ok: false,
          error: 'serviceType and config are required',
        },
        { status: 400 }
      )
    }

    await saveServicePromptConfig(serviceType, config)

    return NextResponse.json({
      ok: true,
      message: `Service prompt config saved for ${serviceType}`,
    })
  } catch (error: any) {
    console.error('Error saving service prompt config:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to save service prompt config',
      },
      { status: 500 }
    )
  }
}
