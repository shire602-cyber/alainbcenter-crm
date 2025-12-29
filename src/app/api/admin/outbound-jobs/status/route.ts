/**
 * ADMIN DEBUG ENDPOINT: Outbound Jobs Status
 * 
 * Returns counts and metrics for outbound job queue.
 * Helps verify job processing in production.
 * 
 * GET /api/admin/outbound-jobs/status
 * Requires authentication (admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get job counts by status
    const [queued, running, done, failed] = await Promise.all([
      prisma.outboundJob.count({ where: { status: 'queued' } }),
      prisma.outboundJob.count({ where: { status: 'running' } }),
      prisma.outboundJob.count({ where: { status: 'done' } }),
      prisma.outboundJob.count({ where: { status: 'failed' } }),
    ])
    
    // Get oldest queued job age
    const oldestQueuedJob = await prisma.outboundJob.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, runAt: true },
    })
    
    const oldestQueuedJobAge = oldestQueuedJob
      ? Math.floor((Date.now() - oldestQueuedJob.createdAt.getTime()) / 1000) // Age in seconds
      : null
    
    // Get recent job stats (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [recentDone, recentFailed] = await Promise.all([
      prisma.outboundJob.count({
        where: {
          status: 'done',
          completedAt: { gte: last24h },
        },
      }),
      prisma.outboundJob.count({
        where: {
          status: 'failed',
          completedAt: { gte: last24h },
        },
      }),
    ])
    
    return NextResponse.json({
      ok: true,
      counts: {
        queued,
        running,
        done,
        failed,
        total: queued + running + done + failed,
      },
      oldestQueuedJob: oldestQueuedJob
        ? {
            id: oldestQueuedJob.id,
            createdAt: oldestQueuedJob.createdAt.toISOString(),
            runAt: oldestQueuedJob.runAt.toISOString(),
            ageSeconds: oldestQueuedJobAge,
            ageMinutes: oldestQueuedJobAge ? Math.floor(oldestQueuedJobAge / 60) : null,
            ageHours: oldestQueuedJobAge ? Math.floor(oldestQueuedJobAge / 3600) : null,
          }
        : null,
      recent24h: {
        done: recentDone,
        failed: recentFailed,
      },
    })
  } catch (error: any) {
    console.error('GET /api/admin/outbound-jobs/status error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

