import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi, getCurrentUserApi } from '@/lib/authApi'

/**
 * POST /api/admin/users/[id]/deactivate
 * Deactivate a user account (admin only)
 * For now, we'll add an isActive field in the future, or just prevent login
 * Currently, we'll update the user to set a flag or remove session capability
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const userId = parseInt(resolvedParams.id)
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentUser = await getCurrentUserApi()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (currentUser.id === userId) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'User deactivation feature coming soon. For now, you can remove the user manually.',
    })
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('POST /api/admin/users/[id]/deactivate error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}
