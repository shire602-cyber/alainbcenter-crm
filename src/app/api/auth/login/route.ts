import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth-password'
import { createSessionToken } from '@/lib/auth-session'

export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { email, password } = body

    console.log('[LOGIN API] Login attempt for:', email)

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Find user by email with timeout protection
    const userPromise = prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        name: true,
      },
    })

    // Add 5 second timeout for login query
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000)
    })

    const user = await Promise.race([userPromise, timeoutPromise]) as any

    if (!user) {
      console.log('[LOGIN API] User not found:', email)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password)
    if (!isValidPassword) {
      console.log('[LOGIN API] Invalid password for:', email)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    console.log('[LOGIN API] Password valid, creating session for:', user.id)

    // Create session token (now async)
    const sessionToken = await createSessionToken(user.id, user.email, user.role)
    console.log('[LOGIN API] Session token created, length:', sessionToken.length)

    // Get redirect URL from query params or default to '/dashboard'
    const redirectUrl = req.nextUrl.searchParams.get('redirect') || '/dashboard'
    
    // Return JSON response with success and cookie
    // This avoids redirect issues with fetch API
    const response = NextResponse.json({
      success: true,
      redirect: redirectUrl,
    })

    // Set cookie on the response
    // For localhost development, use 'lax' sameSite and non-secure
    // In production, use 'strict' and secure
    const isProduction = process.env.NODE_ENV === 'production'
    response.cookies.set('alaincrm_session', sessionToken, {
      httpOnly: true,
      secure: isProduction, // false for localhost, true for HTTPS
      sameSite: 'lax', // allow OAuth redirects in production
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    
    // Log cookie details for debugging
    console.log('[LOGIN API] Cookie set with options:', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    
    console.log('[LOGIN API] Cookie set, returning success response')
    return response
  } catch (error: any) {
    console.error('[LOGIN API] Error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Login failed' },
      { status: 500 }
    )
  }
}

