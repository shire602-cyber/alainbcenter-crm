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
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const body = await req.json()

    if (body.role) {
      const normalizedRole = body.role.toUpperCase()
      if (normalizedRole !== 'ADMIN' && normalizedRole !== 'AGENT') {
        return NextResponse.json(
          { error: 'Invalid role. Must be "admin" or "agent"' },
          { status: 400 }
        )
      }
      body.role = normalizedRole
    }

    const updateData: any = {}
    if (body.role) {
      updateData.role = body.role
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error: any) {
    let status = error.statusCode || 500
    if (error.code === 'P2025') {
      status = 404
    }
    console.error('PATCH /api/admin/users/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}
