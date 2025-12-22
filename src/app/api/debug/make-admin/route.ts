import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Debug endpoint to make current user admin (for development only)
export async function POST(req: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development' },
        { status: 403 }
      )
    }

    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Update user to admin (use uppercase to match schema)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'You are now an admin! Refresh the page to see admin menu items.',
      user: updatedUser,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to make admin' },
      { status: 500 }
    )
  }
}























