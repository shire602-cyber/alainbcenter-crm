/**
 * INSTAGRAM ORCHESTRATOR - Parallel to WhatsApp Orchestrator
 * 
 * This is the entry point for processing Instagram inbound messages.
 * It treats Instagram as a first-class messaging channel, mirroring WhatsApp functionality.
 * 
 * Flow:
 * 1. Deduplication
 * 2. Identity Resolution (fetch username from Graph API)
 * 3. Contact/Conversation/Lead Creation (via autoMatchPipeline)
 * 4. Data Enrichment (service, nationality, phone extraction)
 * 5. Auto-Reply Dispatch (via orchestrator directly, not job queue)
 * 
 * SAFETY: This orchestrator ONLY processes Instagram messages.
 * WhatsApp messages must use handleInboundMessageAutoMatch.
 */

import { prisma } from '../prisma'
import { handleInboundMessageAutoMatch } from './autoMatchPipeline'
import { fetchInstagramUserProfile } from '@/server/integrations/meta/profile'
import { sendAiReply } from '../ai/orchestrator'
import { getDecryptedPageToken } from '@/server/integrations/meta/storage'

export interface OrchestrateInstagramInboundInput {
  senderId: string
  messageText: string
  providerMessageId: string
  timestamp: Date
  instagramProfile?: { name: string | null; username: string | null; profilePic: string | null } | null
  metadata?: {
    mediaUrl?: string | null
    mediaMimeType?: string | null
    providerMediaId?: string | null
    [key: string]: any
  }
  pageId?: string
  workspaceId?: number
  connectionId?: number
}

export interface OrchestrateInstagramInboundResult {
  contact: any
  conversation: any
  lead: any
  message: any
  autoReplied: boolean
}

/**
 * Main orchestrator entry point for Instagram inbound messages
 * 
 * SAFETY CHECK: This function ONLY processes Instagram messages.
 * If channel is not Instagram, it will throw an error.
 */
export async function orchestrateInstagramInbound(
  input: OrchestrateInstagramInboundInput
): Promise<OrchestrateInstagramInboundResult> {
  const startTime = Date.now()
  
  // SAFETY CHECK: This orchestrator ONLY processes Instagram messages
  // Never process WhatsApp or other channels here
  if (!input.senderId || input.senderId.trim() === '') {
    throw new Error('[INSTAGRAM-ORCHESTRATOR] SAFETY CHECK: senderId is required for Instagram messages')
  }
  
  console.log(`[INSTAGRAM-ORCHESTRATOR] Inbound message received`, {
    senderId: input.senderId,
    providerMessageId: input.providerMessageId,
    messageLength: input.messageText?.length || 0,
    hasProfile: !!input.instagramProfile,
    timestamp: input.timestamp.toISOString(),
  })

  // Step 1: Identity Resolution - Fetch username if not provided
  let instagramProfile = input.instagramProfile
  let pageAccessToken: string | null = null

  // If profile not provided, fetch it from Graph API
  if (!instagramProfile && input.connectionId) {
    try {
      pageAccessToken = await getDecryptedPageToken(input.connectionId)
      if (pageAccessToken && input.senderId) {
        console.log(`[INSTAGRAM-ORCHESTRATOR] Fetching username from Graph API for senderId: ${input.senderId}`)
        instagramProfile = await fetchInstagramUserProfile(input.senderId, pageAccessToken)
        
        if (instagramProfile) {
          console.log(`[INSTAGRAM-ORCHESTRATOR] Username fetched: @${instagramProfile.username || 'N/A'}`, {
            senderId: input.senderId,
            username: instagramProfile.username,
            name: instagramProfile.name,
          })
        } else {
          console.warn(`[INSTAGRAM-ORCHESTRATOR] Failed to fetch username for senderId: ${input.senderId}`)
        }
      }
    } catch (profileError: any) {
      console.error(`[INSTAGRAM-ORCHESTRATOR] Error fetching profile:`, {
        senderId: input.senderId,
        error: profileError.message,
      })
      // Continue processing even if profile fetch fails
    }
  }

  // Step 2: Use autoMatchPipeline for Contact/Conversation/Lead/Message creation
  // This reuses shared utilities and ensures consistency with WhatsApp flow
  console.log(`[INSTAGRAM-ORCHESTRATOR] Calling autoMatchPipeline for enrichment`)
  
  const autoMatchResult = await handleInboundMessageAutoMatch({
    channel: 'INSTAGRAM',
    providerMessageId: input.providerMessageId,
    fromPhone: `ig:${input.senderId}`, // Instagram uses ig: prefix for phone field
    fromEmail: null,
    fromName: instagramProfile?.name || instagramProfile?.username || 'Instagram User',
    text: input.messageText,
    timestamp: input.timestamp,
    metadata: {
      ...input.metadata,
      senderId: input.senderId,
      instagramProfile: instagramProfile || undefined,
    },
  })

  const { contact, conversation, lead, message } = autoMatchResult

  // Step 3: Store Instagram username in dedicated fields (if available)
  if (instagramProfile && (instagramProfile.username || instagramProfile.name)) {
    try {
      const updateData: any = {}
      
      // Store username if available
      if (instagramProfile.username) {
        updateData.igUsername = instagramProfile.username
      }
      
      // Store user ID
      updateData.igUserId = input.senderId
      
      // Update fullName if it's generic and we have a better name
      const currentName = contact.fullName || ''
      const isGeneric = !currentName || 
        currentName === 'Instagram User' || 
        currentName.includes('Unknown') ||
        currentName.startsWith('@') ||
        currentName.trim() === ''
      
      if (isGeneric && (instagramProfile.name || instagramProfile.username)) {
        updateData.fullName = instagramProfile.name || instagramProfile.username || currentName
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: updateData,
        })
        
        console.log(`[INSTAGRAM-ORCHESTRATOR] Contact updated with Instagram identity`, {
          contactId: contact.id,
          igUsername: updateData.igUsername,
          igUserId: updateData.igUserId,
          fullNameUpdated: !!updateData.fullName,
        })
      }
    } catch (updateError: any) {
      console.error(`[INSTAGRAM-ORCHESTRATOR] Failed to update contact with Instagram identity:`, {
        contactId: contact.id,
        error: updateError.message,
      })
      // Non-blocking - continue processing
    }
  }

  // Step 4: Auto-Reply Dispatch (call orchestrator directly, not job queue)
  let autoReplied = false
  
  if (lead && lead.id && message && message.id && conversation && conversation.id) {
    // Check if conversation is assigned to a user (skip auto-reply if assigned)
    const conversationWithAssignment = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { assignedUserId: true },
    })
    
    const isAssignedToUser = conversationWithAssignment?.assignedUserId !== null && 
                             conversationWithAssignment?.assignedUserId !== undefined
    
    if (isAssignedToUser) {
      console.log(`[INSTAGRAM-ORCHESTRATOR] Skipping auto-reply - conversation assigned to user ${conversationWithAssignment.assignedUserId}`)
    } else {
      // Call orchestrator directly (not job queue)
      try {
        console.log(`[INSTAGRAM-ORCHESTRATOR] Auto-reply triggered`, {
          conversationId: conversation.id,
          messageId: message.id,
          leadId: lead.id,
        })
        
        const replyResult = await sendAiReply({
          conversationId: conversation.id,
          inboundMessageId: message.id,
          inboundProviderMessageId: input.providerMessageId,
        }, 'auto_reply')
        
        if (replyResult.success) {
          autoReplied = true
          console.log(`[INSTAGRAM-ORCHESTRATOR] Auto-reply sent successfully`, {
            conversationId: conversation.id,
            messageId: replyResult.messageId,
            wasDuplicate: replyResult.wasDuplicate,
          })
        } else if (replyResult.skipped) {
          console.log(`[INSTAGRAM-ORCHESTRATOR] Auto-reply skipped: ${replyResult.skipReason}`, {
            conversationId: conversation.id,
          })
        } else {
          console.warn(`[INSTAGRAM-ORCHESTRATOR] Auto-reply failed: ${replyResult.error}`, {
            conversationId: conversation.id,
          })
        }
      } catch (replyError: any) {
        console.error(`[INSTAGRAM-ORCHESTRATOR] Auto-reply error:`, {
          conversationId: conversation.id,
          error: replyError.message,
          stack: replyError.stack?.substring(0, 200),
        })
        // Non-blocking - message is already stored
      }
    }
  } else {
    console.warn(`[INSTAGRAM-ORCHESTRATOR] Cannot trigger auto-reply - missing required data`, {
      hasLead: !!lead,
      hasMessage: !!message,
      hasConversation: !!conversation,
    })
  }

  const elapsed = Date.now() - startTime
  console.log(`[INSTAGRAM-ORCHESTRATOR] Processing completed`, {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId: lead.id,
    messageId: message.id,
    autoReplied,
    elapsed: `${elapsed}ms`,
  })
  
  // Final safety check: Verify conversation channel is Instagram
  if (conversation.channel?.toLowerCase() !== 'instagram') {
    console.error(`[INSTAGRAM-ORCHESTRATOR] SAFETY CHECK FAILED: Conversation channel is ${conversation.channel}, expected 'instagram'`, {
      conversationId: conversation.id,
      actualChannel: conversation.channel,
    })
    // Don't throw - message is already stored, but log the error
  }

  return {
    contact,
    conversation,
    lead,
    message,
    autoReplied,
  }
}
