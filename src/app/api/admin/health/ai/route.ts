/**
 * GET /api/admin/health/ai
 * 
 * Production validation endpoint for AI reply system
 * Returns diagnostic information for monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'

export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminApi()
    
    // Get last 20 outbound logs
    // Filter out rows with null outboundDedupeKey (legacy rows before idempotency system)
    const outboundLogs = await prisma.outboundMessageLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      where: {
        // Only include rows with outboundDedupeKey (new idempotent system)
        // Legacy rows will be backfilled by the fix script
        outboundDedupeKey: { not: null },
      },
      include: {
        conversation: {
          select: {
            id: true,
            contactId: true,
            leadId: true,
            channel: true,
          },
        },
      },
    })
    
    // Count dedupe collisions (duplicate attempts)
    // Only count rows with non-null outboundDedupeKey
    const dedupeCollisions = await prisma.outboundMessageLog.groupBy({
      by: ['outboundDedupeKey'],
      where: {
        outboundDedupeKey: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gt: 1,
          },
        },
      },
    })
    
    // Get last 10 conversations with state
    const conversations = await prisma.conversation.findMany({
      take: 10,
      orderBy: { lastMessageAt: 'desc' },
      where: {
        questionsAskedCount: {
          gt: 0,
        },
      },
      select: {
        id: true,
        contactId: true,
        leadId: true,
        channel: true,
        qualificationStage: true,
        questionsAskedCount: true,
        lastQuestionKey: true,
        stateVersion: true,
        knownFields: true,
        lastMessageAt: true,
      },
    })
    
    // Count outbound logs by status
    const statusCounts = await prisma.outboundMessageLog.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    })
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      outboundLogs: outboundLogs.map(log => ({
        id: log.id,
        conversationId: log.conversationId,
        provider: log.provider,
        status: log.status,
        dedupeKey: log.outboundDedupeKey ? log.outboundDedupeKey.substring(0, 16) + '...' : 'N/A (legacy)',
        replyType: log.replyType,
        lastQuestionKey: log.lastQuestionKey,
        createdAt: log.createdAt,
        sentAt: log.sentAt,
        failedAt: log.failedAt,
        error: log.error,
      })),
      dedupeCollisions: {
        count: dedupeCollisions.length,
        details: dedupeCollisions
          .filter(c => c.outboundDedupeKey !== null)
          .map(c => ({
            dedupeKey: c.outboundDedupeKey!.substring(0, 16) + '...',
            attempts: c._count.id,
          })),
      },
      conversations: conversations.map(conv => ({
        id: conv.id,
        contactId: conv.contactId,
        leadId: conv.leadId,
        channel: conv.channel,
        qualificationStage: conv.qualificationStage,
        questionsAskedCount: conv.questionsAskedCount,
        lastQuestionKey: conv.lastQuestionKey,
        stateVersion: conv.stateVersion,
        knownFields: conv.knownFields ? JSON.parse(conv.knownFields) : {},
        lastMessageAt: conv.lastMessageAt,
      })),
      statusCounts: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count.id
        return acc
      }, {} as Record<string, number>),
    })
  } catch (error: any) {
    console.error('Error in AI health endpoint:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

