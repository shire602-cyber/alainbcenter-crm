import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth-password'

/**
 * GET /api/auth/setup
 * Check if any users exist (to determine if setup is needed)
 */
export async function GET() {
  try {
    const userCount = await prisma.user.count()
    return NextResponse.json({ usersExist: userCount > 0 })
  } catch (error) {
    return NextResponse.json({ usersExist: false })
  }
}

/**
 * POST /api/auth/setup
 * Create first admin user (only works if no users exist)
 */
export async function POST(req: NextRequest) {
  try {
    // Check if users already exist
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Users exist in the system.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { name, email, password } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if email already exists (shouldn't happen if no users, but safety check)
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Hash password securely
    const hashedPassword = await hashPassword(password)

    // Create admin user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: 'ADMIN', // First user is always admin
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      user,
      message: 'Admin user created successfully',
    })
  } catch (error: any) {
    console.error('POST /api/auth/setup error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
