import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth-password'

/**
 * POST /api/auth/emergency-reset
 * Emergency password reset endpoint (no auth required, but requires EMERGENCY_SECRET)
 * Use this if you're locked out of your account
 */
export async function POST(req: NextRequest) {
  try {
    // Require emergency secret for security
    const emergencySecret = req.headers.get('x-emergency-secret') || req.nextUrl.searchParams.get('secret')
    const expectedSecret = process.env.EMERGENCY_SECRET || 'EMERGENCY_RESET_2024'

    if (!emergencySecret || emergencySecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid or missing emergency secret' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { email, password, name, role } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existing) {
      // Update existing user
      const hashedPassword = await hashPassword(password)
      const updated = await prisma.user.update({
        where: { email: email.toLowerCase().trim() },
        data: {
          password: hashedPassword,
          role: role || existing.role,
          name: name || existing.name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Password reset successfully',
        user: updated,
      })
    } else {
      // Create new user
      const hashedPassword = await hashPassword(password)
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name || 'Admin User',
          password: hashedPassword,
          role: role || 'ADMIN',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'User created successfully',
        user,
      })
    }
  } catch (error: any) {
    console.error('POST /api/auth/emergency-reset error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to reset password' },
      { status: 500 }
    )
  }
}
