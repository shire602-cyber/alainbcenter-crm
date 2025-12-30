/**
 * JOB DEBUG ENDPOINT
 * 
 * Browser-testable debug endpoint for inspecting outbound job status.
 * Bypasses auth via middleware (under /api/jobs).
 * 
 * Query params:
 * - ?conversationId=123 - Filter by conversation
 * - ?status=PENDING - Filter by status
 * - ?limit=50 - Limit results (default: 50)
 */

// Prevent Vercel caching
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const conversationIdParam = searchParams.get('conversationId')
    const statusParam = searchParams.get('status')
    const limitParam = searchParams.get('limit')
    
    const conversationId = conversationIdParam ? parseInt(conversationIdParam) : null
    const status = statusParam || null
    const limit = limitParam ? parseInt(limitParam) : 50
    
    // Build where clause
    const where: any = {}
    if (conversationId && !isNaN(conversationId)) {
      where.conversationId = conversationId
    }
    if (status) {
      where.status = status
    }
    
    // Get counts by status
    const statusCounts = await prisma.outboundJob.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
      where: conversationId && !isNaN(conversationId) ? { conversationId } : undefined,
    })
    
    const countsByStatus: Record<string, number> = {}
    statusCounts.forEach((item) => {
      countsByStatus[item.status] = item._count.id
    })
    
    // Get newest jobs
    const jobs = await prisma.outboundJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastAttemptAt: true,
        claimedAt: true,
        errorLog: true,
        conversationId: true,
        inboundProviderMessageId: true,
        attempts: true,
        maxAttempts: true,
        content: true,
        runAt: true,
        error: true,
      },
    })
    
    // Find stuck jobs (GENERATING or READY_TO_SEND with claimedAt > 5 min old)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const stuckJobs = await prisma.outboundJob.findMany({
      where: {
        status: {
          in: ['GENERATING', 'READY_TO_SEND'],
        },
        OR: [
          { claimedAt: { lt: fiveMinutesAgo } },
          { claimedAt: null, startedAt: { lt: fiveMinutesAgo } },
        ],
      },
      orderBy: { claimedAt: 'asc' },
      take: 20,
      select: {
        id: true,
        status: true,
        claimedAt: true,
        startedAt: true,
        createdAt: true,
        conversationId: true,
        attempts: true,
      },
    })
    
    // Find not eligible jobs (runAt in the future)
    const now = new Date()
    const notEligibleJobs = await prisma.outboundJob.findMany({
      where: {
        status: {
          in: ['PENDING', 'READY_TO_SEND'],
        },
        runAt: {
          gt: now,
        },
      },
      orderBy: { runAt: 'asc' },
      take: 20,
      select: {
        id: true,
        status: true,
        runAt: true,
        createdAt: true,
        conversationId: true,
        attempts: true,
      },
    })
    
    // Format jobs for response
    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      lastAttemptAt: job.lastAttemptAt?.toISOString() || null,
      claimedAt: job.claimedAt?.toISOString() || null,
      errorLog: job.errorLog ? (job.errorLog.length > 500 ? job.errorLog.substring(0, 500) + '...' : job.errorLog) : null,
      conversationId: job.conversationId,
      inboundProviderMessageId: job.inboundProviderMessageId,
      retryCount: job.attempts,
      maxAttempts: job.maxAttempts,
      contentLength: job.content ? job.content.length : null,
      runAt: job.runAt.toISOString(),
      error: job.error ? (job.error.length > 200 ? job.error.substring(0, 200) + '...' : job.error) : null,
    }))
    
    // Format stuck jobs
    const formattedStuckJobs = stuckJobs.map((job) => ({
      id: job.id,
      status: job.status,
      claimedAt: job.claimedAt?.toISOString() || null,
      startedAt: job.startedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      conversationId: job.conversationId,
      attempts: job.attempts,
      reason: job.claimedAt 
        ? `Claimed ${Math.round((Date.now() - job.claimedAt.getTime()) / 1000 / 60)} minutes ago`
        : `Started ${job.startedAt ? Math.round((Date.now() - job.startedAt.getTime()) / 1000 / 60) : 'unknown'} minutes ago`,
    }))
    
    // Format not eligible jobs
    const formattedNotEligibleJobs = notEligibleJobs.map((job) => ({
      id: job.id,
      status: job.status,
      runAt: job.runAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
      conversationId: job.conversationId,
      attempts: job.attempts,
      reason: `Scheduled for ${job.runAt.toISOString()} (${Math.round((job.runAt.getTime() - Date.now()) / 1000 / 60)} minutes from now)`,
    }))
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      filters: {
        conversationId: conversationId || null,
        status: status || null,
        limit,
      },
      countsByStatus,
      jobs: formattedJobs,
      stuckJobs: formattedStuckJobs,
      notEligibleJobs: formattedNotEligibleJobs,
      summary: {
        total: formattedJobs.length,
        stuck: formattedStuckJobs.length,
        notEligible: formattedNotEligibleJobs.length,
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    // Loud failure for schema mismatch
    if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.error('[DB-MISMATCH] OutboundJob schema mismatch. DB migrations not applied.')
      return NextResponse.json(
        {
          ok: false,
          error: 'DB migrations not applied. Run: npx prisma migrate deploy',
          code: 'DB_MISMATCH',
          prismaError: error.code,
        },
        { status: 500 }
      )
    }
    
    console.error('[JOBS-DEBUG] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}

