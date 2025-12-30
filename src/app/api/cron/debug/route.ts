/**
 * CRON DEBUG ENDPOINT
 * 
 * Returns request metadata (headers, query params) for debugging cron/webhook issues.
 * Does NOT require authentication (bypassed in middleware).
 * NEVER returns secrets or token values.
 */

// Prevent Vercel caching
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const now = new Date().toISOString()
  const pathname = req.nextUrl.pathname
  const host = req.headers.get('host') || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const xVercelCron = req.headers.get('x-vercel-cron') || null
  const hasAuthorization = !!req.headers.get('authorization')
  const hasTokenQuery = req.nextUrl.searchParams.has('token')
  
  // Get query param keys ONLY (never values)
  const queryKeys = Array.from(req.nextUrl.searchParams.keys())
  
  return NextResponse.json({
    ok: true,
    now,
    path: pathname,
    host,
    userAgent,
    xVercelCron,
    hasAuthorization,
    hasTokenQuery,
    queryKeys,
  }, {
    headers: { 'Content-Type': 'application/json' },
  })
}

