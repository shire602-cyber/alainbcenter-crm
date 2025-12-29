/**
 * CRON JOB: Run Outbound Jobs
 * 
 * Triggers job runner to process queued outbound jobs.
 * Can be called by Vercel Cron or external cron service.
 * 
 * Configured in vercel.json to run every minute: * * * * *
 */

// Ensure Node.js runtime for Prisma compatibility
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production'

export async function GET(req: NextRequest) {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  try {
    console.log(`[CRON] trigger start requestId=${requestId}`)
    
    // 1) FIX CRON AUTH: Accept ANY truthy x-vercel-cron header value (not just "1")
    // Vercel Cron sends x-vercel-cron header, but value may vary
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const queryToken = req.nextUrl.searchParams.get('token')
    
    // Auth rules: authorized if (x-vercel-cron header exists) OR (Authorization: Bearer <CRON_SECRET>) OR (query token === CRON_SECRET)
    let isAuthorized = false
    let authMethod = 'none'
    
    if (vercelCronHeader) {
      // Accept ANY truthy value (not just "1")
      isAuthorized = true
      authMethod = 'vercel'
      console.log(`[CRON] authorized via vercel requestId=${requestId} x-vercel-cron="${vercelCronHeader}"`)
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === CRON_SECRET) {
        isAuthorized = true
        authMethod = 'bearer'
        console.log(`[CRON] authorized via bearer requestId=${requestId}`)
      }
    } else if (queryToken && queryToken === CRON_SECRET) {
      // Query token support for manual debugging
      isAuthorized = true
      authMethod = 'query'
      console.log(`[CRON] authorized via query requestId=${requestId}`)
    }
    
    if (!isAuthorized) {
      // Log unauthorized request details (never print secrets)
      console.warn(`[CRON] unauthorized requestId=${requestId}`, {
        hasVercelCronHeader: !!vercelCronHeader,
        vercelCronValue: vercelCronHeader ? `"${vercelCronHeader}"` : null,
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader ? authHeader.substring(0, 20) + '...' : null,
        hasQueryToken: !!queryToken,
        queryTokenLength: queryToken?.length || 0,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // 2) IMPROVE OBSERVABILITY: Call job runner with structured logging
    console.log(`[CRON] calling job runner requestId=${requestId} authMethod=${authMethod}`)
    
    const jobRunnerUrl = new URL('/api/jobs/run-outbound', req.url)
    jobRunnerUrl.searchParams.set('token', process.env.JOB_RUNNER_TOKEN || 'dev-token-change-in-production')
    jobRunnerUrl.searchParams.set('max', '50') // Process up to 50 jobs per run
    
    const jobRunnerStartTime = Date.now()
    const response = await fetch(jobRunnerUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    const jobRunnerElapsed = Date.now() - jobRunnerStartTime
    const statusCode = response.status
    const data = await response.json()
    
    console.log(`[CRON] job runner response requestId=${requestId} statusCode=${statusCode} elapsed=${jobRunnerElapsed}ms`, {
      ok: data.ok,
      processed: data.processed,
      failed: data.failed,
    })
    
    // 3) Return 200 even if job runner returns ok=false (cron succeeded, jobs may have failed)
    return NextResponse.json({
      ok: true,
      message: 'Job runner triggered',
      jobRunnerResult: data,
      requestId,
      authMethod,
      elapsed: `${jobRunnerElapsed}ms`,
    })
  } catch (error: any) {
    console.error(`[CRON] error requestId=${requestId}`, {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.json(
      { 
        ok: false,
        error: error.message || 'Internal server error',
        requestId,
      },
      { status: 500 }
    )
  }
}

// Deployment trigger Mon Dec 29 16:12:30 +04 2025
// Force deployment - 1767010709
