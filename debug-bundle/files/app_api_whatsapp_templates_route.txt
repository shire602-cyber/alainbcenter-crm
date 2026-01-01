import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/whatsapp/templates
 * List all WhatsApp templates
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    try {
      const status = req.nextUrl.searchParams.get('status')
      const where: any = {}
      if (status) {
        where.status = status
      }

      const templates = await (prisma as any).whatsAppTemplate?.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json(templates || [])
    } catch (modelError: any) {
      if (
        modelError.message?.includes('whatsAppTemplate') ||
        modelError.message?.includes('does not exist')
      ) {
        console.warn('WhatsAppTemplate model not available yet')
        return NextResponse.json([])
      }
      throw modelError
    }
  } catch (error: any) {
    console.error('GET /api/whatsapp/templates error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load templates' },
      { status: error.statusCode || 500 }
    )
  }
}

/**
 * POST /api/whatsapp/templates
 * Create a new WhatsApp template
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { name, language, body: templateBody, status } = body

    if (!name || !templateBody) {
      return NextResponse.json(
        { error: 'Name and body are required' },
        { status: 400 }
      )
    }

    try {
      const existing = await (prisma as any).whatsAppTemplate?.findUnique({
        where: { name },
      })

      if (existing) {
        return NextResponse.json(
          { error: 'Template with this name already exists' },
          { status: 400 }
        )
      }

      const template = await (prisma as any).whatsAppTemplate.create({
        data: {
          name,
          language: language || 'en_US',
          body: templateBody,
          status: status || 'draft',
        },
      })

      return NextResponse.json(template, { status: 201 })
    } catch (modelError: any) {
      if (
        modelError.message?.includes('whatsAppTemplate') ||
        modelError.message?.includes('does not exist')
      ) {
        return NextResponse.json(
          {
            error:
              'WhatsApp templates feature not available. Please run: npx prisma migrate dev && npx prisma generate',
          },
          { status: 503 }
        )
      }
      throw modelError
    }
  } catch (error: any) {
    console.error('POST /api/whatsapp/templates error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create template' },
      { status: error.statusCode || 500 }
    )
  }
}
