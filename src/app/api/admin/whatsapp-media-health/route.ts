import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { getWhatsAppCredentials } from '@/lib/whatsapp'
import { prisma } from '@/lib/prisma'
import { MEDIA_TYPES } from '@/lib/media/extractMediaId'

/**
 * GET /api/admin/whatsapp-media-health
 * Health check endpoint for WhatsApp media configuration and proxy
 * Reports token source, token presence, and optionally tests media fetch
 * Uses unified credentials function (single source of truth)
 * ADMIN ONLY
 * 
 * Query params:
 * - testMediaId: optional media ID to test fetch (will attempt to fetch metadata)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const url = new URL(req.url)
    const testMediaId = url.searchParams.get('testMediaId')

    // Get credentials using unified function (single source of truth)
    let credentials
    let tokenPresent = false
    let tokenSource: 'env' | 'db' | 'none' = 'none'
    let phoneNumberIdPresent = false

    try {
      credentials = await getWhatsAppCredentials()
      tokenPresent = !!credentials.accessToken
      tokenSource = credentials.tokenSource
      phoneNumberIdPresent = !!credentials.phoneNumberId
    } catch (e) {
      // Credentials not configured
      tokenPresent = false
      tokenSource = 'none'
      phoneNumberIdPresent = false
    }

    const token = credentials?.accessToken || null

    // Test media fetch if mediaId provided
    let mediaTest: any = null
    if (testMediaId && token) {
      try {
        // Use same API version as the main codebase (v21.0)
        const response = await fetch(`https://graph.facebook.com/v21.0/${testMediaId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const mediaData = await response.json()
          mediaTest = {
            success: true,
            hasUrl: !!mediaData.url,
            mimeType: mediaData.mime_type || null,
            fileSize: mediaData.file_size || null,
            sha256: mediaData.sha256 || null,
          }
        } else {
          mediaTest = {
            success: false,
            status: response.status,
            statusText: response.statusText,
            error: await response.text().catch(() => 'Unknown error'),
          }
        }
      } catch (e: any) {
        mediaTest = {
          success: false,
          error: e.message,
        }
      }
    }

    // Get stats on messages with missing providerMediaId
    const missingMediaIdStats = await prisma.message.groupBy({
      by: ['type'],
      where: {
        AND: [
          {
            OR: [
              { type: { in: Array.from(MEDIA_TYPES) } },
              { mediaMimeType: { not: null } },
            ],
          },
          { providerMediaId: null },
        ],
      },
      _count: {
        id: true,
      },
    })

    const totalMissing = missingMediaIdStats.reduce((sum, stat) => sum + stat._count.id, 0)

    return NextResponse.json({
      ok: true,
      configuration: {
        tokenPresent,
        tokenSource,
        phoneNumberIdPresent,
      },
      mediaTest: testMediaId ? mediaTest : { message: 'No testMediaId provided' },
      stats: {
        messagesWithMissingProviderMediaId: totalMissing,
        byType: missingMediaIdStats.map(stat => ({
          type: stat.type,
          count: stat._count.id,
        })),
      },
      recommendations: [
        !tokenPresent && 'Configure WhatsApp access token (DB Integration config.accessToken or WHATSAPP_ACCESS_TOKEN env var)',
        !phoneNumberIdPresent && 'Configure WhatsApp phone number ID',
        totalMissing > 0 && `Run backfill to fix ${totalMissing} messages with missing providerMediaId: POST /api/admin/backfill-media-ids`,
      ].filter(Boolean),
    })
  } catch (error: any) {
    console.error('WhatsApp media health check error:', error)
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message,
      },
      { status: 500 }
    )
  }
}
