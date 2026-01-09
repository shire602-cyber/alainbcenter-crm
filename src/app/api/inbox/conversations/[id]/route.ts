import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { computeConversationFlags } from '@/lib/inbox/intelligence'
import { MEDIA_TYPES } from '@/lib/media/extractMediaId'
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

    // Use explicit select to avoid fetching missing columns (lastProcessedInboundMessageId, etc.)
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          contactId: true,
          leadId: true,
          channel: true,
          status: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          unreadCount: true,
          priorityScore: true,
          createdAt: true,
          updatedAt: true,
          aiState: true,
          aiLockUntil: true,
          lastAiOutboundAt: true,
          ruleEngineMemory: true,
          deletedAt: true,
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
            orderBy: { createdAt: 'desc' }, // Most recent first
            take: 50, // Reduced from 500 to 50 to prevent PostgreSQL memory errors (code 53200)
            // NOTE: Using explicit select to include all message fields (providerMediaId, mediaFilename, mediaSize, etc.)
            // Fields are accessed later via type assertions where needed (e.g., (msg as any).mediaSize)
            select: {
              id: true,
              direction: true,
              channel: true,
              type: true,
              body: true,
              providerMediaId: true,
              mediaUrl: true,
              mediaMimeType: true,
              mediaFilename: true,
              mediaSize: true,
              status: true,
              providerMessageId: true,
              sentAt: true,
              createdAt: true,
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
      // Gracefully handle missing columns (deletedAt, lastProcessedInboundMessageId, etc.) - query works without them
      if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column') || 
          error.message?.includes('deletedAt') || error.message?.includes('lastProcessedInboundMessageId')) {
        console.warn('[DB] Missing column detected, querying with select to exclude problematic columns (this is OK if migration not yet applied):', error.message?.substring(0, 100))
        // Retry with explicit select to exclude lastProcessedInboundMessageId and other missing columns
        try {
          conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
              id: true,
              contactId: true,
              leadId: true,
              channel: true,
              status: true,
              lastMessageAt: true,
              lastInboundAt: true,
              lastOutboundAt: true,
              unreadCount: true,
              priorityScore: true,
              createdAt: true,
              updatedAt: true,
              aiState: true,
              aiLockUntil: true,
              lastAiOutboundAt: true,
              ruleEngineMemory: true,
              deletedAt: true,
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
                orderBy: { createdAt: 'desc' }, // Most recent first
                take: 50, // Reduced from 500 to 50 to prevent PostgreSQL memory errors (code 53200)
                select: {
                  id: true,
                  direction: true,
                  channel: true,
                  type: true,
                  body: true,
                  providerMediaId: true,
                  mediaUrl: true,
                  mediaMimeType: true,
                  mediaFilename: true,
                  mediaSize: true,
                  status: true,
                  providerMessageId: true,
                  sentAt: true,
                  createdAt: true,
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
                    take: 10,
                  },
                },
              },
            },
          }) as any
        } catch (retryError: any) {
          console.error('[DB] Failed to query conversation:', retryError)
          throw retryError
        }
      } else {
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

    // Canonical media detection helper
    const looksLikeWhatsAppMediaId = (v?: string | null): boolean => {
      if (!v) return false
      return /^[0-9]{8,}$/.test(v.trim()) // WhatsApp media IDs are numeric strings (simple heuristic)
    }

    // Canonical isMedia() function - same logic as outbound
    const isMedia = (msg: any): boolean => {
      // Priority 1: providerMediaId exists
      if (msg.providerMediaId && msg.providerMediaId.trim() !== '') return true
      
      // Priority 2: mediaUrl exists and looks like WhatsApp media ID (numeric)
      if (looksLikeWhatsAppMediaId(msg.mediaUrl)) return true
      
      // Priority 3: type is in MEDIA_TYPES
      if (msg.type && MEDIA_TYPES.has((msg.type || '').toLowerCase())) return true
      
      // Priority 4: mediaMimeType indicates media
      if (msg.mediaMimeType) {
        const mime = msg.mediaMimeType.toLowerCase()
        if (mime.match(/^(image|audio|video)\//) || mime === 'application/pdf') return true
      }
      
      return false
    }

    // Reverse messages array if ordered desc (to get chronological order for display)
    // We fetched most recent 50 in desc order, so reverse to show oldest first
    const messagesInOrder = conversation.messages.slice().reverse()
    
    // Format messages for frontend - PHASE 5A: Include attachments
    const formattedMessages = messagesInOrder.map((msg: any) => {
      // Use canonical isMedia() function
      const msgIsMedia = isMedia(msg)
      const mediaProxyUrl = msgIsMedia ? `/api/media/messages/${msg.id}` : null
      
      // Debug log (no PII)
      console.log('[INBOX-MEDIA-CLASSIFY]', {
        messageId: msg.id,
        type: msg.type,
        providerMediaId: !!msg.providerMediaId,
        mediaUrl: !!msg.mediaUrl,
        mediaMimeType: msg.mediaMimeType,
        isMedia: msgIsMedia,
      })

      const formatted = {
        id: msg.id,
        direction: msg.direction,
        channel: msg.channel,
        type: msg.type,
        body: msg.body,
        providerMediaId: (msg as any).providerMediaId || null, // CRITICAL: Include providerMediaId
        mediaUrl: msg.mediaUrl, // CRITICAL: Include mediaUrl (legacy compatibility, stores providerMediaId for WhatsApp)
        mediaMimeType: msg.mediaMimeType,
        mediaFilename: msg.mediaFilename || null, // CRITICAL: Include mediaFilename for document downloads
        mediaSize: (msg as any).mediaSize || null, // FIX: Include mediaSize for file size display
        mediaProxyUrl: mediaProxyUrl, // Canonical proxy URL
        hasMedia: msgIsMedia, // Canonical media flag
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
      
      return formatted
    })

    // Get last message for preview (most recent message)
    // After reversing desc-ordered messages, the last element is the most recent
    const lastMessage = messagesInOrder.length > 0 
      ? messagesInOrder[messagesInOrder.length - 1] 
      : (conversation.messages.length > 0 ? conversation.messages[0] : null)
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



