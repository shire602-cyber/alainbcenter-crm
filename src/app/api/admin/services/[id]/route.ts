import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid service ID' }, { status: 400 })
    }

    const body = await req.json()
    const updateData: any = {}

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json(
          { error: 'Service name cannot be empty' },
          { status: 400 }
        )
      }
      updateData.name = body.name.trim()
    }

    if (body.code !== undefined) {
      updateData.code = body.code?.trim() || null
      
      // Check for duplicate code if provided
      if (updateData.code) {
        const existing = await prisma.serviceType.findFirst({
          where: {
            code: updateData.code,
            NOT: { id },
          },
        })
        if (existing) {
          return NextResponse.json(
            { error: 'Service code already exists' },
            { status: 400 }
          )
        }
      }
    }

    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive
    }

    const service = await prisma.serviceType.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(service)
  } catch (error: any) {
    let status = error.statusCode || 500
    if (error.code === 'P2025') {
      status = 404
    }
    console.error('PATCH /api/admin/services/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid service ID' }, { status: 400 })
    }

    // Check if service has related leads
    const leadCount = await prisma.lead.count({
      where: { serviceTypeId: id },
    })

    if (leadCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete service: ${leadCount} lead(s) are using this service`,
        },
        { status: 400 }
      )
    }

    await prisma.serviceType.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.redirect) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }
    console.error('DELETE /api/admin/services/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

