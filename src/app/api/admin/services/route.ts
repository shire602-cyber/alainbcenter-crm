import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const services = await prisma.serviceType.findMany({
      include: {
        _count: {
          select: { leads: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(services)
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('GET /api/admin/services error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Service name is required' },
        { status: 400 }
      )
    }

    // Check for duplicate code if provided
    if (body.code) {
      const existing = await prisma.serviceType.findUnique({
        where: { code: body.code },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'Service code already exists' },
          { status: 400 }
        )
      }
    }

    const service = await prisma.serviceType.create({
      data: {
        name: body.name.trim(),
        code: body.code?.trim() || null,
        isActive: body.isActive !== false, // Default to true
      },
    })

    return NextResponse.json(service, { status: 201 })
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('POST /api/admin/services error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}

