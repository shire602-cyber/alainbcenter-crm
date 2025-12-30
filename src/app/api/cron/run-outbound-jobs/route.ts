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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cron/run-outbound-jobs/route.ts:17',message:'Cron GET entry',data:{requestId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  try {
    console.log(`[CRON] start requestId=${requestId}`)
    
    // Task A: Auth - accept ANY truthy x-vercel-cron header (do NOT require === "1")
    // Keep Bearer + query token support for manual testing
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const tokenQuery = req.nextUrl.searchParams.get('token')
    
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    // Accept any truthy value Vercel sends (could be "1", "true", etc.)
    const isVercelCron = !!vercelCronHeader
    const isSecretOk = (bearer && bearer === CRON_SECRET) || (tokenQuery && tokenQuery === CRON_SECRET)
    
    if (!isVercelCron && !isSecretOk) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cron/run-outbound-jobs/route.ts:35',message:'Cron unauthorized',data:{hasVercelHeader:isVercelCron,hasAuthHeader:!!authHeader,hasTokenQuery:!!tokenQuery},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.warn(`[CRON] unauthorized requestId=${requestId}`, {
        hasVercelHeader: isVercelCron,
        vercelHeaderValue: vercelCronHeader || null,
        hasAuthHeader: !!authHeader,
        hasTokenQuery: !!tokenQuery,
      })
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { 
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    // Task A: Determine auth method for logging
    const authMethod = isVercelCron ? 'vercel' : (bearer ? 'bearer' : 'query')
    // Task A: Structured logs
    console.log(`[CRON] authorized method=${authMethod} requestId=${requestId} vercelHeaderValue="${vercelCronHeader || 'N/A'}"`)
    
    // Task A: Check if JOB_RUNNER_TOKEN is missing in prod
    const jobRunnerToken = process.env.JOB_RUNNER_TOKEN
    if (!jobRunnerToken || jobRunnerToken.trim() === '' || jobRunnerToken === 'dev-token-change-in-production') {
      const errorMsg = 'JOB_RUNNER_TOKEN missing in environment'
      console.error(`[CRON] ${errorMsg} requestId=${requestId}`)
      return NextResponse.json(
        { 
          ok: false,
          code: 'MISSING_ENV',
          error: errorMsg,
          requestId,
        },
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    // Task A: Call job runner with structured logging
    console.log(`[CRON] calling job runner requestId=${requestId} authMethod=${authMethod}`)
    
    const jobRunnerUrl = new URL('/api/jobs/run-outbound', req.url)
    jobRunnerUrl.searchParams.set('token', jobRunnerToken)
    jobRunnerUrl.searchParams.set('max', '50') // Process up to 50 jobs per run
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cron/run-outbound-jobs/route.ts:64',message:'Before job runner fetch',data:{jobRunnerUrl:jobRunnerUrl.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const jobRunnerStartTime = Date.now()
    let response: Response
    try {
      response = await fetch(jobRunnerUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (fetchError: any) {
      console.error(`[CRON] job runner fetch failed requestId=${requestId}:`, fetchError.message)
      return NextResponse.json(
        {
          ok: false,
          code: 'DOWNSTREAM_FETCH_ERROR',
          error: `Failed to call job runner: ${fetchError.message}`,
          requestId,
        },
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    const jobRunnerElapsed = Date.now() - jobRunnerStartTime
    const statusCode = response.status
    
    // Task A: Handle downstream response safely - read text first, then try JSON.parse
    const responseText = await response.text()
    let data: any
    let parseError: Error | null = null
    
    try {
      data = JSON.parse(responseText)
    } catch (parseErr: any) {
      parseError = parseErr
      // Task A: If parse fails, return JSON with body preview
      const bodyPreview = responseText.substring(0, 300)
      console.error(`[CRON] job runner returned non-JSON requestId=${requestId} statusCode=${statusCode} bodyPreview="${bodyPreview}"`)
      return NextResponse.json(
        {
          ok: false,
          code: 'DOWNSTREAM_NOT_JSON',
          statusCode,
          bodyPreview,
          requestId,
        },
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    // Task A: If status is not 2xx, return JSON error
    if (statusCode < 200 || statusCode >= 300) {
      const bodyPreview = responseText.substring(0, 300)
      console.error(`[CRON] job runner returned error requestId=${requestId} statusCode=${statusCode} bodyPreview="${bodyPreview}"`)
      return NextResponse.json(
        {
          ok: false,
          code: 'DOWNSTREAM_ERROR',
          statusCode,
          bodyPreview,
          requestId,
        },
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cron/run-outbound-jobs/route.ts:120',message:'After job runner fetch',data:{statusCode,ok:data.ok,processed:data.processed,failed:data.failed,elapsed:jobRunnerElapsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Task A: Structured logs
    console.log(`[CRON] job runner response requestId=${requestId} statusCode=${statusCode} elapsed=${jobRunnerElapsed}ms ok=${data.ok} processed=${data.processed || 0} failed=${data.failed || 0}`)
    
    // Task A: Return 200 even if job runner returns ok=false (cron succeeded, jobs may have failed)
    // Always set Content-Type application/json
    return NextResponse.json({
      ok: true,
      message: 'Job runner triggered',
      jobRunnerResult: data,
      requestId,
      authMethod,
      elapsed: `${jobRunnerElapsed}ms`,
    }, {
      headers: { 'Content-Type': 'application/json' },
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
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// Deployment trigger Mon Dec 29 16:12:30 +04 2025
// Force deployment - 1767010709
