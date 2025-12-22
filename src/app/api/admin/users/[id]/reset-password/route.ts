import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'
import { hashPassword } from '@/lib/auth-password'

/**
 * POST /api/admin/users/[id]/reset-password
 * Reset a user's password (admin only)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const userId = parseInt(resolvedParams.id)
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { newPassword } = body

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const hashedPassword = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    return NextResponse.json({ success: true, message: 'Password reset successfully' })
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('POST /api/admin/users/[id]/reset-password error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}
