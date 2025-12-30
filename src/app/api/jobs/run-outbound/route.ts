/**
 * JOB RUNNER: Process Outbound Jobs (Manual/Debug Trigger)
 * 
 * Manual endpoint for triggering job processing.
 * Uses shared processOutboundJobs() function.
 */

// Ensure Node.js runtime for Prisma compatibility
export const runtime = 'nodejs'
// Prevent Vercel caching
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processOutboundJobs } from '@/lib/jobs/processOutboundJobs'

// Protect with token (set in env: JOB_RUNNER_TOKEN)
const JOB_RUNNER_TOKEN = process.env.JOB_RUNNER_TOKEN || 'dev-token-change-in-production'

/**
 * GET /api/jobs/run-outbound?token=...&max=10
 * Process queued outbound jobs (manual/debug trigger)
 */
export async function GET(req: NextRequest) {
  const requestId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  try {
    // Verify token - accept query token OR Authorization bearer
    const tokenQuery = req.nextUrl.searchParams.get('token')
    const authHeader = req.headers.get('authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    // Check query token OR bearer token
    const isAuthorized = (tokenQuery && tokenQuery === JOB_RUNNER_TOKEN) || (bearer && bearer === JOB_RUNNER_TOKEN)
    
    if (!isAuthorized) {
      console.warn(`[JOB-RUNNER] unauthorized requestId=${requestId}`, {
        hasTokenQuery: !!tokenQuery,
        hasBearer: !!bearer,
      })
      return NextResponse.json(
        { 
          ok: false, 
          code: 'UNAUTHORIZED',
          error: 'Unauthorized',
          requestId,
        },
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    console.log(`[JOB-RUNNER] authorized requestId=${requestId}`)
    
    const maxJobs = parseInt(req.nextUrl.searchParams.get('max') || '10')
    
    // Call shared processing function
    const result = await processOutboundJobs({
      max: maxJobs,
      requestId,
      source: 'manual',
    })
    
    // Return JSON response
    if (result.ok) {
      return NextResponse.json({
        ok: true,
        processed: result.processed,
        failed: result.failed,
        jobIds: result.jobIds,
        message: result.message,
        requestId,
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
        },
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error: any) {
    console.error(`❌ [JOB-RUNNER] Error requestId=${requestId}:`, error)
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

