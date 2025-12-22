import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Debug endpoint to check user role
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        authenticated: false 
      }, { status: 401 })
    }

    // Get full user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    return NextResponse.json({
      authenticated: true,
      user: dbUser,
      isAdmin: dbUser?.role === 'admin',
      message: dbUser?.role === 'admin' 
        ? 'You are an admin. Admin menu items should be visible.'
        : `Your role is "${dbUser?.role}". Only users with role "admin" can access admin features.`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to check role' },
      { status: 500 }
    )
  }
}






















