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
    
    // TASK A: Fix Cron authorization permanently
    // Support: (a) Vercel Cron header x-vercel-cron (accept ANY truthy value)
    //          (b) Authorization Bearer <CRON_SECRET>
    //          (c) Query param ?token=<CRON_SECRET> as fallback
    // Step C: Auth must accept Vercel cron (x-vercel-cron === "1"), Bearer token, or query token
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const tokenQuery = req.nextUrl.searchParams.get('token')
    
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    // Step C: Check x-vercel-cron === "1" specifically (not just truthy)
    const isVercelCron = vercelCronHeader === '1'
    const isSecretOk = (bearer && bearer === CRON_SECRET) || (tokenQuery && tokenQuery === CRON_SECRET)
    
    if (!isVercelCron && !isSecretOk) {
      // Step C: Log unauthorized request details (never print secrets)
      console.warn(`[CRON] unauthorized requestId=${requestId}`, {
        hasVercelHeader: !!vercelCronHeader,
        vercelHeaderValue: vercelCronHeader || null,
        hasAuthHeader: !!authHeader,
        hasTokenQuery: !!tokenQuery,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Step C: Determine auth method for logging
    const authMethod = isVercelCron ? 'vercel' : (bearer ? 'bearer' : 'query')
    console.log(`✅ [CRON] authorized method=${authMethod} requestId=${requestId} vercelHeaderValue="${vercelCronHeader || 'N/A'}"`)
    
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
