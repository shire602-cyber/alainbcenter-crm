/**
 * CRON JOB: Run Outbound Jobs
 * 
 * Processes queued outbound jobs directly (no HTTP call to job runner).
 * Can be called by Vercel Cron or external cron service.
 * 
 * Configured in vercel.json to run every minute: * * * * *
 */

// Ensure Node.js runtime for Prisma compatibility
export const runtime = 'nodejs'
// Prevent Vercel caching
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processOutboundJobs } from '@/lib/jobs/processOutboundJobs'

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production'

export async function GET(req: NextRequest) {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  // Log at the very top to confirm handler was reached
  const vercelCronHeader = req.headers.get('x-vercel-cron')
  const userAgent = req.headers.get('user-agent') || 'unknown'
  console.log(`[CRON] reached handler requestId=${requestId} xVercelCron=${vercelCronHeader || 'N/A'} ua=${userAgent.substring(0, 50)}`)
  
  try {
    console.log(`[CRON] start requestId=${requestId}`)
    
    // Auth - accept ANY truthy x-vercel-cron header (do NOT require === "1")
    // Keep Bearer + query token support for manual testing
    const authHeader = req.headers.get('authorization')
    const tokenQuery = req.nextUrl.searchParams.get('token')
    
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    // Accept any truthy value Vercel sends (could be "1", "true", etc.)
    const isVercelCron = !!vercelCronHeader
    const isSecretOk = (bearer && bearer === CRON_SECRET) || (tokenQuery && tokenQuery === CRON_SECRET)
    
    if (!isVercelCron && !isSecretOk) {
      console.warn(`[CRON] unauthorized requestId=${requestId}`, {
        hasVercelHeader: isVercelCron,
        vercelHeaderValue: vercelCronHeader || null,
        hasAuthHeader: !!authHeader,
        hasTokenQuery: !!tokenQuery,
      })
      return NextResponse.json({ 
        ok: false,
        code: 'UNAUTHORIZED',
        error: 'Unauthorized',
        requestId,
      }, { 
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    // Determine auth method for logging
    const authMethod = isVercelCron ? 'vercel' : (bearer ? 'bearer' : 'query')
    console.log(`[CRON] authorized method=${authMethod} requestId=${requestId} vercelHeaderValue="${vercelCronHeader || 'N/A'}"`)
    
    // Process jobs directly (no HTTP call)
    const maxJobs = parseInt(req.nextUrl.searchParams.get('max') || '50') // Default 50 for cron
    console.log(`[CRON] processing jobs directly requestId=${requestId} max=${maxJobs}`)
    
    const processStartTime = Date.now()
    const result = await processOutboundJobs({
      max: maxJobs,
      requestId,
      source: 'cron',
    })
    const processElapsed = Date.now() - processStartTime
    
    // Structured logs
    console.log(`[CRON] job processing complete requestId=${requestId} elapsed=${processElapsed}ms ok=${result.ok} processed=${result.processed || 0} failed=${result.failed || 0}`)
    
    // Return JSON response
    if (result.ok) {
      return NextResponse.json({
        ok: true,
        message: 'Jobs processed',
        processed: result.processed,
        failed: result.failed,
        jobIds: result.jobIds,
        requestId,
        authMethod,
        elapsed: `${processElapsed}ms`,
      }, {
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      return NextResponse.json(
        {
          ok: false,
          code: result.code || 'PROCESSING_ERROR',
          error: result.error || 'Internal server error',
          processed: result.processed,
          failed: result.failed,
          jobIds: result.jobIds,
          requestId,
          authMethod,
        },
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error: any) {
    console.error(`[CRON] error requestId=${requestId}`, {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.json(
      { 
        ok: false,
        code: 'INTERNAL_ERROR',
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
