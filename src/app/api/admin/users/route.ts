import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'
import { hashPassword } from '@/lib/auth-password'

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(users)
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('GET /api/admin/users error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { name, email, password, role } = body

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

    const normalizedRole = role ? role.toUpperCase() : 'AGENT'
    if (normalizedRole !== 'ADMIN' && normalizedRole !== 'AGENT') {
      return NextResponse.json(
        { error: 'Role must be "admin" or "agent"' },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: normalizedRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error: any) {
    const status = error.statusCode || 500
    console.error('POST /api/admin/users error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status }
    )
  }
}






