import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Use Edge-only version to avoid any Node.js dependencies
import { decodeSessionToken } from '@/lib/auth-session-edge'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // CRITICAL: Hard bypass for cron, webhooks, jobs, and health endpoints
  // These MUST bypass auth checks BEFORE any session validation
  // Path-based bypass (does not rely on headers which may vary)
  const bypassPaths = [
    '/api/cron',      // All cron endpoints (including /api/cron/run-outbound-jobs, /api/cron/debug)
    '/api/webhooks',  // All webhook endpoints
    '/api/jobs',      // All job runner endpoints
    '/api/health',   // Health check endpoints
  ]
  
  // Check bypass FIRST (before any auth logic)
  if (bypassPaths.some((p) => pathname.startsWith(p))) {
    const userAgent = req.headers.get('user-agent') || 'unknown'
    console.log(`[MIDDLEWARE] bypass path=${pathname} ua=${userAgent.substring(0, 50)}`)
    return NextResponse.next()
  }

  // Public paths that don't require authentication
  const publicPaths = [
    '/', // Landing page (public)
    '/login',
    '/api/auth/login',
    '/api/auth/logout',
    '/setup',
    '/api/auth/setup',
    '/marketing', // Marketing pages are public
    '/privacy-policy', // Privacy policy (required for Meta/Instagram management)
    '/api/automation/run-daily',
    '/api/auth/emergency-reset',
  ]
  
  // D) LOCK DOWN DEBUG ROUTES: Only allow in development
  if (process.env.NODE_ENV === 'development') {
    publicPaths.push(
      '/api/debug-cookie',
      '/api/test-cookie',
      '/test-login',
      '/test' // Test page
    )
  }

  // Check if path is public
  // Special handling for root path: if user is logged in, they can access dashboard
  // If not logged in, show landing page (public)
  if (pathname === '/') {
    // Root path is public (landing page), but we'll let the page component handle logged-in state
    return NextResponse.next()
  }
  
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next()
  }

  // Check for session token
  const cookieObj = req.cookies.get('alaincrm_session')
  const token = cookieObj?.value

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[Middleware] Path:', pathname)
  }

  // Decode session token
  let user = null
  if (token) {
    try {
      user = await decodeSessionToken(token)
    } catch (error: any) {
      console.log('[Middleware] Token decode error:', error?.message)
    }
  }

  // If no valid session, redirect to login
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role-based access control
  const userRole = user.role?.toUpperCase() || 'AGENT'
  
  // ADMIN and MANAGER-only paths
  const adminManagerPaths = ['/admin', '/automation', '/settings']
  if (adminManagerPaths.some((p) => pathname.startsWith(p))) {
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: Admin or Manager access required' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
  
  // ADMIN-only paths
  const adminOnlyPaths = ['/admin/users', '/admin/integrations']
  if (adminOnlyPaths.some((p) => pathname.startsWith(p))) {
    if (userRole !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

