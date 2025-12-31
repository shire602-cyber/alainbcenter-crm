import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { computeConversationFlags } from '@/lib/inbox/intelligence'
/**
 * GET /api/inbox/conversations/[id]
 * Returns full conversation details with all messages
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    // TASK 3: Loud failure if schema mismatch (P2022) - do NOT silently work around
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              nationality: true,
            }
          },
          lead: {
            select: {
              id: true,
              stage: true,
              pipelineStage: true,
              leadType: true,
              serviceTypeId: true,
              priority: true,
              aiScore: true,
              notes: true,
              nextFollowUpAt: true,
              expiryDate: true,
              assignedUserId: true,
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                },
              },
              serviceType: {
                select: {
                  id: true,
                  name: true,
                },
              },
              assignedUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              expiryItems: {
                orderBy: { expiryDate: 'asc' },
                take: 5,
                select: {
                  id: true,
                  type: true,
                  expiryDate: true,
                },
              },
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 500, // Limit to last 500 messages to prevent memory issues
            include: {
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              attachments: {
                select: {
                  id: true,
                  type: true,
                  url: true,
                  mimeType: true,
                  filename: true,
                  sizeBytes: true,
                  durationSec: true,
                  thumbnailUrl: true,
                },
                take: 10, // Limit attachments per message
              },
            },
          },
        },
      })
    } catch (error: any) {
      // TASK 3: Loud failure for schema mismatch - do NOT silently work around
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied.')
        return NextResponse.json(
          { 
            ok: false, 
            error: 'DB migrations not applied. Run: npx prisma migrate deploy',
            code: 'DB_MISMATCH',
          },
          { status: 500 }
        )
      }
      // Handle PostgreSQL out of memory errors
      if (error.code === '53200' || error.message?.includes('out of memory') || error.message?.includes('postgres message too large')) {
        console.error('[DB-OOM] PostgreSQL out of memory error. Conversation may have too many messages.')
        return NextResponse.json(
          { 
            ok: false, 
            error: 'Database query failed: conversation too large. Please contact support.',
            code: 'DB_OOM',
            hint: 'This conversation has too many messages. Try archiving old messages.',
          },
          { status: 500 }
        )
      }
      throw error
    }

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Check if conversation is archived (soft-deleted)
    // Safe property access - deletedAt may not exist if migration not applied
    let isArchived = false
    try {
      isArchived = (conversation as any).deletedAt !== null && (conversation as any).deletedAt !== undefined
    } catch (e) {
      // deletedAt column may not exist - ignore
      isArchived = false
    }

    // Format messages for frontend - PHASE 5A: Include attachments
    const formattedMessages = conversation.messages.map((msg: any) => {
      const formatted = {
        id: msg.id,
        direction: msg.direction,
        channel: msg.channel,
        type: msg.type,
        body: msg.body,
        mediaUrl: msg.mediaUrl,
        mediaMimeType: msg.mediaMimeType,
        status: msg.status,
        providerMessageId: msg.providerMessageId,
        sentAt: msg.sentAt?.toISOString() || null,
        createdBy: msg.createdByUser
          ? {
              id: msg.createdByUser.id,
              name: msg.createdByUser.name,
              email: msg.createdByUser.email,
            }
          : null,
        createdAt: msg.createdAt.toISOString(),
        // PHASE 5A: Include attachments
        attachments: (msg.attachments || []).map((att: any) => ({
          id: att.id,
          type: att.type,
          url: att.url,
          mimeType: att.mimeType,
          filename: att.filename,
          sizeBytes: att.sizeBytes,
          durationSec: att.durationSec,
          thumbnailUrl: att.thumbnailUrl,
        })),
      }
      
      // PHASE 1 DEBUG: Log messages with media
      if (msg.mediaUrl || (msg.attachments && msg.attachments.length > 0)) {
        console.log('[INBOX-API-DEBUG] Message with media', {
          messageId: msg.id,
          type: msg.type,
          mediaUrl: msg.mediaUrl,
          mediaMimeType: msg.mediaMimeType,
          attachmentsCount: msg.attachments?.length || 0,
          attachments: msg.attachments?.map((a: any) => ({ type: a.type, url: a.url })) || [],
        })
      }
      
      return formatted
    })

    // Get last message for preview
    const lastMessage = conversation.messages[conversation.messages.length - 1]
    // Compute intelligence flags
    const flags = await computeConversationFlags(conversationId)

    // Generate suggested next actions (rule-based for now)
    const suggestedNextActions: string[] = []
    if (flags.NEEDS_REPLY) {
      suggestedNextActions.push('Reply to customer message')
    }
    if (flags.SLA_BREACH) {
      suggestedNextActions.push('Urgent: SLA breach - respond immediately')
    }
    if (flags.EXPIRY_SOON && flags.metrics.daysToNearestExpiry !== null) {
      suggestedNextActions.push(
        `Expiry in ${flags.metrics.daysToNearestExpiry} days - follow up`
      )
    }
    if (flags.OVERDUE_FOLLOWUP) {
      suggestedNextActions.push('Follow-up is overdue - contact customer')
    }
    if (flags.HOT) {
      suggestedNextActions.push('Hot lead - prioritize engagement')
    }
    if (suggestedNextActions.length === 0) {
      suggestedNextActions.push('No urgent actions required')
    }
    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        contact: {
          id: conversation.contact.id,
          fullName: conversation.contact.fullName,
          phone: conversation.contact.phone,
          email: conversation.contact.email,
          nationality: conversation.contact.nationality,
        },
        
        lead: conversation.lead
          ? {
              id: conversation.lead.id,
              contact: conversation.lead.contact,
              stage: conversation.lead.stage,
              pipelineStage: conversation.lead.pipelineStage,
              leadType: conversation.lead.leadType,
              serviceType: conversation.lead.serviceType
                ? {
                    id: conversation.lead.serviceType.id,
                    name: conversation.lead.serviceType.name,
                  }
                : null,
              priority: conversation.lead.priority,
              aiScore: conversation.lead.aiScore,
              notes: conversation.lead.notes,
              nextFollowUpAt: conversation.lead.nextFollowUpAt?.toISOString() || null,
              expiryDate: conversation.lead.expiryDate?.toISOString() || null,
              assignedUser: conversation.lead.assignedUser,
              expiryItems: conversation.lead.expiryItems.map((item: any) => ({
                id: item.id,
                type: item.type,
                expiryDate: item.expiryDate.toISOString(),
              })),
            }
          : null,
        channel: conversation.channel,
        status: conversation.status,
        assignedUser: conversation.assignedUser,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        unreadCount: conversation.unreadCount,
        createdAt: conversation.createdAt.toISOString(),
        deletedAt: (conversation as any).deletedAt?.toISOString() || null,
        isArchived,
        messages: formattedMessages,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              direction: lastMessage.direction,
              body: lastMessage.body,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
          flags: {
            UNREAD: flags.UNREAD,
            NEEDS_REPLY: flags.NEEDS_REPLY,
            SLA_BREACH: flags.SLA_BREACH,
            EXPIRY_SOON: flags.EXPIRY_SOON,
            OVERDUE_FOLLOWUP: flags.OVERDUE_FOLLOWUP,
            HOT: flags.HOT,
          },
          metrics: flags.metrics,
          priorityScore: flags.priorityScore,
          suggestedNextActions,
      },
    })
  } catch (error: any) {
    console.error('GET /api/inbox/conversations/[id] error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load conversation' },
      { status: error.statusCode || 500 }
    )
  }
}



