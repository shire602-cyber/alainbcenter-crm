/**
 * GET /api/jobs/debug
 * Debug endpoint to inspect OutboundJob queue state
 * 
 * Bypasses auth for internal debugging (same bypass strategy as cron/webhooks/jobs)
 * OR include safe token auth if needed
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // CRITICAL FIX F: Safe token auth OR bypass for internal use
    // For now, allow without auth for internal debugging (same as cron/webhooks)
    // In production, add token check: const token = req.headers.get('x-debug-token')
    // if (token !== process.env.DEBUG_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const searchParams = req.nextUrl.searchParams
    const statusFilter = searchParams.get('status') // PENDING | GENERATING | READY_TO_SEND | SENT | FAILED
    
    // Build where clause
    const where: any = {}
    if (statusFilter) {
      where.status = statusFilter
    }
    
    // Get counts by status
    const counts = await prisma.outboundJob.groupBy({
      by: ['status'],
      _count: { id: true },
    })
    
    // Get top 50 jobs with details
    const jobs = await prisma.outboundJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        conversation: {
          select: {
            id: true,
            leadId: true,
            contactId: true,
            channel: true,
          },
        },
        inboundMessage: {
          select: {
            id: true,
            providerMessageId: true,
            body: true,
          },
        },
      },
    })
    
    // Calculate claim age for claimed jobs
    const now = new Date()
    const jobsWithAge = jobs.map(job => {
      let claimAgeMinutes: number | null = null
      if (job.claimedAt) {
        claimAgeMinutes = Math.round((now.getTime() - job.claimedAt.getTime()) / (1000 * 60))
      }
      
      return {
        id: job.id,
        conversationId: job.conversationId,
        status: job.status,
        idempotencyKey: job.idempotencyKey?.substring(0, 16) + '...',
        inboundProviderMessageId: job.inboundProviderMessageId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        runAt: job.runAt,
        scheduledAt: job.runAt, // Alias for clarity
        claimedAt: job.claimedAt,
        claimAgeMinutes,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        error: job.error,
        errorLog: job.errorLog?.substring(0, 200),
        content: job.content?.substring(0, 100),
        requestId: job.requestId,
        conversation: job.conversation,
        inboundMessage: job.inboundMessage,
      }
    })
    
    return NextResponse.json({
      ok: true,
      counts: counts.map(c => ({
        status: c.status,
        count: c._count.id,
      })),
      jobs: jobsWithAge,
      total: jobsWithAge.length,
      filter: statusFilter || 'all',
    })
  } catch (error: any) {
    console.error('[DEBUG] Error in jobs debug endpoint:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch debug info' },
      { status: 500 }
    )
  }
}
