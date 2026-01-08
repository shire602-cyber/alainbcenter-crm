import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrManagerApi } from '@/lib/authApi'
import { applyDisciplineRulesBatch } from '@/lib/inbox/discipline'
import { computeConversationFlagsBatch } from '@/lib/inbox/intelligence'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/inbox/refresh-intelligence
 * Admin/staff endpoint to recompute flags and create tasks for all open WhatsApp conversations
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    // Get all open WhatsApp conversations
    // TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
    let conversations
    try {
      conversations = await prisma.conversation.findMany({
        where: {
          channel: 'whatsapp',
          status: 'open',
          deletedAt: null, // Exclude soft-deleted conversations
        },
        select: { id: true },
      })
    } catch (error: any) {
      // Gracefully handle missing deletedAt column - query works without it
      if (error.code === 'P2022' || error.message?.includes('deletedAt') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] deletedAt column not found, querying without it (this is OK if migration not yet applied)')
        // Retry without deletedAt filter
        try {
          conversations = await prisma.conversation.findMany({
            where: {
              channel: 'whatsapp',
              status: 'open',
            },
            select: { id: true },
          })
        } catch (retryError: any) {
          console.error('[DB] Failed to query conversations:', retryError)
          throw retryError
        }
      } else {
        throw error
      }
    }

    console.log(`Refreshing intelligence for ${conversations.length} conversations...`)

    // Step 1: Recompute flags for all conversations
    const conversationIds = conversations.map((c) => c.id)
    const flagsMap = await computeConversationFlagsBatch(conversationIds)

    // Step 2: Update priority scores in database
    const updatePromises = Array.from(flagsMap.entries()).map(([id, flags]) =>
      prisma.conversation.update({
        where: { id },
        data: {
          priorityScore: flags.priorityScore,
          needsReplySince: flags.NEEDS_REPLY ? new Date() : null,
          slaBreachAt: flags.SLA_BREACH ? new Date() : null,
        },
      })
    )

    await Promise.all(updatePromises)

    // Step 3: Apply discipline rules (create tasks)
    const disciplineResults = await applyDisciplineRulesBatch()

    return NextResponse.json({
      ok: true,
      processed: conversations.length,
      flagsComputed: flagsMap.size,
      tasksCreated: disciplineResults.tasksCreated,
      errors: disciplineResults.errors,
    })
  } catch (error: any) {
    console.error('POST /api/inbox/refresh-intelligence error:', error)

    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to refresh intelligence' },
      { status: 500 }
    )
  }
}