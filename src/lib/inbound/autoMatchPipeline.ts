/**
 * AUTO-MATCH EVERYTHING PIPELINE
 * 
 * Unified inbound message handler that:
 * 1. Deduplicates inbound messages
 * 2. Finds/creates Contact (normalize phone)
 * 3. Finds/creates Conversation
 * 4. Finds/creates Lead (smart rules)
 * 5. Creates CommunicationLog
 * 6. Auto-extracts fields (deterministic)
 * 7. Auto-creates tasks/alerts
 * 8. Auto-replies (optional)
 */

import { prisma } from '../prisma'
import { normalizeInboundPhone, findContactByPhone } from '../phone-inbound'
import { extractService, extractNationality, extractExpiry, extractExpiryHint, extractCounts, extractIdentity } from './fieldExtractors'
import { createAutoTasks } from './autoTasks'
import { handleInboundAutoReply } from '../autoReply'
import { upsertContact } from '../contact/upsert'
import { normalizeChannel } from '../utils/channelNormalize'
import { upsertConversation } from '../conversation/upsert'
import { getExternalThreadId } from '../conversation/getExternalThreadId'
import { mergeJsonSafe, buildLeadUpdateFromExtracted, buildConversationUpdateFromExtracted } from './mergeCollectedData'
import { resolveWhatsAppMedia } from '../media/resolveWhatsAppMedia'

export interface AutoMatchInput {
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
  providerMessageId: string // Unique message ID from provider (for deduplication)
  fromPhone?: string | null
  fromEmail?: string | null
  fromName?: string | null
  text: string
  timestamp?: Date
  metadata?: {
    // PHASE C: providerMediaId is REQUIRED for WhatsApp media (Meta Graph API media ID)
    providerMediaId?: string | null
    // Legacy field for backward compatibility
    mediaUrl?: string | null
    mediaMimeType?: string | null
    mediaFilename?: string | null
    mediaSize?: number | null
    mediaSha256?: string | null
    // Legacy filename field
    filename?: string | null
    [key: string]: any // Allow other metadata fields
  }
}

export interface AutoMatchResult {
  contact: any
  conversation: any
  lead: any
  message: any
  extractedFields: {
    service?: string
    nationality?: string
    expiries?: Array<{ type: string; date: Date }>
    expiryHint?: string | null
    counts?: { partners?: number; visas?: number }
    identity?: { name?: string; email?: string }
    businessActivityRaw?: string | null
  }
  tasksCreated: number
  autoReplied: boolean
  wasDuplicate?: boolean
}

/**
 * Main pipeline entrypoint
 */
export async function handleInboundMessageAutoMatch(
  input: AutoMatchInput
): Promise<AutoMatchResult> {
  const startTime = Date.now()
  
  const logContext = {
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    hasText: !!input.text && input.text.trim().length > 0,
    textPreview: input.text ? input.text.substring(0, 50) : '[no text]',
    senderId: input.metadata?.senderId || 'N/A',
  }
  
  console.log(`🔄 [AUTO-MATCH] Starting pipeline`, logContext)

  // Step 1: DEDUPE inbound message
  const isDuplicate = await checkInboundDedupe(input.channel, input.providerMessageId)
  if (isDuplicate) {
    console.log(`✅ [AUTO-MATCH] Duplicate message detected - skipping`)
    throw new Error('DUPLICATE_MESSAGE')
  }

  // Step 2: FIND/CREATE Contact (using new upsert logic with normalization)
  // Extract waId from webhook payload if available
  const webhookPayload = input.metadata?.webhookEntry || input.metadata?.webhookValue || input.metadata?.rawPayload || input.metadata
  
  // For Instagram, use Instagram user ID as identifier (store in phone field with prefix)
  const isInstagram = input.channel === 'INSTAGRAM'
  const isFacebook = input.channel === 'FACEBOOK'
  const isWhatsApp = input.channel === 'WHATSAPP'
  
  let contactPhone: string
  let contactEmail: string | null = null
  let contactName: string | undefined = undefined
  let instagramUserId: string | null = null
  let instagramProfilePic: string | null = null
  
  if (isInstagram) {
    // For Instagram, use Instagram user ID with prefix in phone field
    instagramUserId = input.metadata?.senderId || null
    if (instagramUserId) {
      contactPhone = `ig:${instagramUserId}` // Store Instagram user ID with prefix
    } else {
      contactPhone = 'ig:unknown' // Fallback if no senderId
    }
    
    // Use fetched Instagram profile information if available
    if (input.metadata?.instagramProfile) {
      const profile = input.metadata.instagramProfile
      contactName = profile.name || profile.username || input.fromName || undefined
      instagramProfilePic = profile.profilePic || null
      
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Using Instagram profile info`, {
        instagramUserId,
        name: contactName || 'N/A',
        username: profile.username || 'N/A',
        hasProfilePic: !!instagramProfilePic,
      })
    } else {
      contactName = input.fromName || undefined
    }
    
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Creating/finding Instagram contact`, {
      instagramUserId,
      contactPhone,
      contactName: contactName || 'N/A',
      hasProfilePic: !!instagramProfilePic,
    })
  } else if (isFacebook) {
    // For Facebook, use Facebook user ID with prefix
    const facebookUserId = input.metadata?.senderId || null
    if (facebookUserId) {
      contactPhone = `fb:${facebookUserId}`
    } else {
      contactPhone = 'fb:unknown'
    }
    contactName = input.fromName || undefined
  } else if (isWhatsApp) {
    // For WhatsApp, normalize phone number
  let normalizedPhone: string | null = null
    if (input.fromPhone) {
    try {
      normalizedPhone = normalizeInboundPhone(input.fromPhone)
      console.log(`✅ [AUTO-MATCH] Normalized phone: ${input.fromPhone} → ${normalizedPhone}`)
    } catch (normalizeError: any) {
      // Log structured error but don't abort - use raw phone
      console.error(`❌ [AUTO-MATCH] Failed to normalize phone`, {
        conversationId: null, // Will be set after conversation creation
        inboundProviderMessageId: input.providerMessageId,
        rawFrom: input.fromPhone,
        normalizedPhoneAttempt: null,
        error: normalizeError.message,
      })
      // Continue with raw phone - upsertContact will try to normalize again
    }
  }
    contactPhone = normalizedPhone || input.fromPhone || input.fromEmail || 'unknown'
    contactName = input.fromName || undefined
  } else {
    // Default fallback
    contactPhone = input.fromPhone || input.fromEmail || 'unknown'
    contactName = input.fromName || undefined
    contactEmail = input.fromEmail || null
  }
  
  // Step 2: FIND/CREATE Contact
  let contactResult
  try {
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: CONTACT_CREATION - Starting`, {
        contactPhone,
        contactName: contactName || 'N/A',
        contactEmail: contactEmail || 'N/A',
        instagramUserId,
      })
    }
    
    contactResult = await upsertContact(prisma, {
      phone: contactPhone,
      fullName: contactName,
      email: contactEmail,
    source: input.channel.toLowerCase(),
      webhookPayload: webhookPayload, // For extracting waId (WhatsApp only)
  })
    
    if (isInstagram) {
      console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: CONTACT_CREATION - Success`, {
        contactId: contactResult.id,
        phone: contactPhone,
        fullName: contactName || 'N/A',
      })
    }
  } catch (contactError: any) {
    const errorDetails = {
      error: contactError.message || 'Unknown error',
      errorName: contactError.name || 'UnknownError',
      errorCode: contactError.code || 'NO_CODE',
      errorStack: contactError.stack?.substring(0, 1000) || 'No stack trace',
      fullError: JSON.stringify(contactError, Object.getOwnPropertyNames(contactError)).substring(0, 1000),
      contactPhone,
      contactName: contactName || 'N/A',
    }
    
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: CONTACT_CREATION - Failed`, errorDetails)
    } else {
      console.error(`❌ [AUTO-MATCH] Failed to upsert contact:`, errorDetails)
    }
    
    throw contactError
  }
  
  // For Instagram, store profile photo URL if available (we'll need to add this to Contact model or use a different approach)
  // For now, we'll update the contact with profile photo in a separate step if needed
  if (isInstagram && instagramProfilePic && contactResult.id) {
    // Note: Contact model doesn't have profilePhoto field yet
    // We'll store it in metadata or add to schema later
    // For now, we can store it in a separate table or add to Conversation metadata
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Profile photo URL: ${instagramProfilePic} (storage pending schema update)`)
  }
  
  // Fetch full contact record with all fields
  if (isInstagram) {
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: CONTACT_FETCH - Fetching full contact record`, {
      contactId: contactResult.id,
    })
  }
  
  const contact = await prisma.contact.findUnique({
    where: { id: contactResult.id },
    select: { id: true, phone: true, phoneNormalized: true, waId: true, fullName: true, email: true, nationality: true },
  })
  
  if (!contact) {
    const errorMsg = `Failed to fetch contact after upsert: ${contactResult.id}`
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: CONTACT_FETCH - Failed`, {
        error: errorMsg,
        contactId: contactResult.id,
      })
    }
    throw new Error(errorMsg)
  }
  
  if (isInstagram) {
    console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: CONTACT_FETCH - Success`, {
      contactId: contact.id,
      phone: contact.phone,
      fullName: contact.fullName || 'N/A',
    })
  }
  
  // Ensure we have a normalized phone for outbound (use phoneNormalized if available, otherwise try to normalize)
  if (!contact.phoneNormalized && contact.phone && input.channel === 'WHATSAPP') {
    try {
      const finalNormalized = normalizeInboundPhone(contact.phone)
      // Update contact with normalized phone
      await prisma.contact.update({
        where: { id: contact.id },
        data: { phoneNormalized: finalNormalized },
      })
      contact.phoneNormalized = finalNormalized
      console.log(`✅ [AUTO-MATCH] Updated contact ${contact.id} with normalized phone: ${finalNormalized}`)
    } catch (error: any) {
      console.warn(`⚠️ [AUTO-MATCH] Could not normalize phone for contact ${contact.id}: ${error.message}`)
    }
  }

  // Step 3: FIND/CREATE Lead (smart rules) - MUST be before conversation to get leadId
  let lead
  try {
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: LEAD_CREATION - Starting`, {
        contactId: contactResult.id,
        channel: input.channel,
        providerMessageId: input.providerMessageId,
        timestamp: input.timestamp?.toISOString() || 'N/A',
      })
    }
    
    console.log(`🔍 [AUTO-MATCH] IMMEDIATELY BEFORE findOrCreateLead call`, {
      contactId: contactResult.id,
      channel: input.channel,
      providerMessageId: input.providerMessageId,
      timestamp: input.timestamp?.toISOString() || 'N/A',
      isInstagram,
    })
    
    try {
      lead = await findOrCreateLead({
    contactId: contactResult.id,
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp, // Use actual message timestamp
  })
      
      console.log(`✅ [AUTO-MATCH] IMMEDIATELY AFTER findOrCreateLead call - SUCCESS`, {
        leadId: lead?.id || 'NULL',
        leadStage: lead?.stage || 'NULL',
        leadContactId: lead?.contactId || 'NULL',
        hasLead: !!lead,
        leadType: typeof lead,
        isInstagram,
      })
      
      if (isInstagram) {
        console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: LEAD_CREATION - Success`, {
          leadId: lead.id,
          stage: lead.stage,
          contactId: lead.contactId,
        })
      }
    } catch (leadError: any) {
      console.error(`❌ [AUTO-MATCH] IMMEDIATELY AFTER findOrCreateLead call - ERROR CAUGHT`, {
        error: leadError.message || 'Unknown error',
        errorName: leadError.name || 'UnknownError',
        errorCode: leadError.code || 'NO_CODE',
        errorStack: leadError.stack?.substring(0, 1000) || 'No stack trace',
        fullError: JSON.stringify(leadError, Object.getOwnPropertyNames(leadError)).substring(0, 1000),
        contactId: contactResult.id,
        channel: input.channel,
        providerMessageId: input.providerMessageId,
        isInstagram,
      })
      
      // Re-throw to trigger outer catch block
      throw leadError
    }
  } catch (leadError: any) {
    // Capture full error object for debugging
    const errorDetails = {
      error: leadError.message || 'Unknown error',
      errorName: leadError.name || 'UnknownError',
      errorCode: leadError.code || 'NO_CODE',
      errorStack: leadError.stack?.substring(0, 1000) || 'No stack trace',
      fullError: JSON.stringify(leadError, Object.getOwnPropertyNames(leadError)).substring(0, 1000),
      contactId: contactResult.id,
      channel: input.channel,
      providerMessageId: input.providerMessageId,
    }
    
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: LEAD_CREATION - Failed`, errorDetails)
    } else {
      console.error(`❌ [AUTO-MATCH] Failed to find or create lead:`, errorDetails)
    }
    
    // Re-throw to prevent silent failure
    throw leadError
  }

  // Step 4: FIND/CREATE Conversation (linked to lead)
  // SYNC ORDER: Conversation must exist before we can update knownFields
  // Extract externalThreadId using canonical function
  // Pass metadata with senderId for Instagram/Facebook fallback extraction
  const webhookPayloadForThreadId = input.metadata?.webhookEntry || input.metadata?.webhookValue || {
    ...input.metadata,
    // Ensure senderId is accessible for Instagram/Facebook fallback
    senderId: input.metadata?.senderId,
    metadata: input.metadata, // Nested metadata for compatibility
  }
  
  const externalThreadId = getExternalThreadId(
    input.channel,
    contact,
    webhookPayloadForThreadId
  )
  
  if (isInstagram) {
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] External thread ID extracted`, {
      externalThreadId: externalThreadId || 'N/A',
      contactPhone: contact.phone || 'N/A',
      hasWebhookPayload: !!webhookPayloadForThreadId,
      hasSenderId: !!webhookPayloadForThreadId?.senderId,
      hasMetadataSenderId: !!input.metadata?.senderId,
    })
  }
  
  // Step 3.5: CRITICAL FIX 4 - Detect language from inbound text
  let detectedLanguage: string | null = null
  if (input.text && input.text.trim().length > 0 && input.text !== '[audio]' && input.text !== '[Audio received]') {
    try {
      const { detectLanguage } = await import('../ai/detectLanguage')
      detectedLanguage = await detectLanguage(input.text)
      console.log(`🌐 [AUTO-MATCH] Detected language: ${detectedLanguage} for message: ${input.text.substring(0, 50)}...`)
    } catch (error: any) {
      console.warn(`⚠️ [AUTO-MATCH] Language detection failed:`, error.message)
    }
  }

  // DIAGNOSTIC LOG: before conversation upsert
  const logData = {
    contactId: contactResult.id,
    channel: input.channel,
    channelLower: input.channel.toLowerCase(),
    externalThreadId,
    leadId: lead.id,
    providerMessageId: input.providerMessageId,
    detectedLanguage,
    contactPhone: contact.phone || 'N/A',
    contactPhoneFormat: contact.phone?.startsWith('ig:') ? 'instagram' : contact.phone?.startsWith('fb:') ? 'facebook' : 'other',
  }
  
  console.log(`[AUTO-MATCH] BEFORE-CONV-UPSERT`, JSON.stringify(logData))
  
  if (isInstagram) {
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Before conversation upsert`, {
      ...logData,
      hasExternalThreadId: !!externalThreadId,
      externalThreadIdPreview: externalThreadId ? externalThreadId.substring(0, 50) : 'N/A',
    })
  }
  
  // For Instagram, store profile photo in knownFields JSON if available
  let knownFields: any = undefined
  if (isInstagram && instagramProfilePic) {
    knownFields = {
      instagramProfilePic: instagramProfilePic,
      instagramUserId: instagramUserId,
      instagramUsername: input.metadata?.instagramProfile?.username || null,
    }
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Storing Instagram profile info in knownFields`, {
      instagramUserId,
      hasProfilePic: !!instagramProfilePic,
      instagramUsername: input.metadata?.instagramProfile?.username || 'N/A',
    })
  }

  // Step 4: FIND/CREATE Conversation (linked to lead)
  let conversationResult
  try {
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: CONVERSATION_CREATION - Starting`, {
        contactId: contactResult.id,
        leadId: lead.id,
        externalThreadId: externalThreadId || 'N/A',
        channel: input.channel.toLowerCase(),
      })
    }
    
    conversationResult = await upsertConversation({
    contactId: contactResult.id,
    channel: input.channel,
    leadId: lead.id, // CRITICAL: Link conversation to lead
    timestamp: input.timestamp, // Use actual message timestamp
    externalThreadId, // Canonical external thread ID
    language: detectedLanguage, // CRITICAL FIX 4: Store detected language
      knownFields: knownFields ? JSON.stringify(knownFields) : undefined, // Store Instagram profile info
    })
    
    if (isInstagram) {
      console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: CONVERSATION_CREATION - Success`, {
        conversationId: conversationResult.id,
        contactId: contactResult.id,
        leadId: lead.id,
        externalThreadId: externalThreadId || 'N/A',
      })
    }
  } catch (convError: any) {
    const errorDetails = {
      error: convError.message || 'Unknown error',
      errorName: convError.name || 'UnknownError',
      errorCode: convError.code || 'NO_CODE',
      errorStack: convError.stack?.substring(0, 1000) || 'No stack trace',
      fullError: JSON.stringify(convError, Object.getOwnPropertyNames(convError)).substring(0, 1000),
      contactId: contactResult.id,
      leadId: lead.id,
      externalThreadId: externalThreadId || 'N/A',
      channel: input.channel.toLowerCase(),
    }
    
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: CONVERSATION_CREATION - Failed`, errorDetails)
    } else {
      console.error(`❌ [AUTO-MATCH] Failed to upsert conversation:`, errorDetails)
    }
    
    throw convError // Re-throw to prevent silent failure
  }
  
  // Fetch full conversation record (exclude lastProcessedInboundMessageId if column doesn't exist)
  let conversation
  try {
    conversation = await prisma.conversation.findUnique({
      where: { id: conversationResult.id },
    })
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
      // Use select to explicitly exclude the problematic column
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationResult.id },
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
        },
      }) as any
    } else {
      throw error
    }
  }
  
  if (!conversation) {
    throw new Error(`Failed to fetch conversation ${conversationResult.id} after upsert`)
  }
  
  // DIAGNOSTIC LOG: after conversation upsert
  console.log(`[AUTO-MATCH] AFTER-CONV-UPSERT`, JSON.stringify({
    conversationId: conversation.id,
    contactId: contactResult.id,
    channel: input.channel.toLowerCase(),
    externalThreadId,
    leadId: lead.id,
    providerMessageId: input.providerMessageId,
  }))

  // Step 5: CREATE CommunicationLog (Message)
  let message
  try {
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: MESSAGE_CREATION - Starting`, {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        providerMessageId: input.providerMessageId,
        textLength: input.text?.length || 0,
        hasMetadata: !!input.metadata,
      })
    }
    
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:createCommunicationLog-call',message:'Calling createCommunicationLog with metadata',data:{conversationId:conversation.id,hasMetadata:!!input.metadata,mediaUrl:input.metadata?.mediaUrl,mediaMimeType:input.metadata?.mediaMimeType,filename:input.metadata?.filename},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I2'})}).catch(()=>{});
  } catch (e) {}
  // #endregion
    
    message = await createCommunicationLog({
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id, // CRITICAL: Include contactId
    channel: input.channel,
    direction: 'in',
    text: input.text,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp || new Date(),
    metadata: input.metadata, // CRITICAL FIX 3: Pass metadata for audio detection (includes mediaUrl, mediaMimeType, filename)
  })
    
    if (isInstagram) {
      console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: MESSAGE_CREATION - Success`, {
        messageId: message.id,
        conversationId: message.conversationId,
        providerMessageId: input.providerMessageId,
        textLength: message.body?.length || 0,
      })
    }
  } catch (msgError: any) {
    const errorDetails = {
      error: msgError.message || 'Unknown error',
      errorName: msgError.name || 'UnknownError',
      errorCode: msgError.code || 'NO_CODE',
      errorStack: msgError.stack?.substring(0, 1000) || 'No stack trace',
      fullError: JSON.stringify(msgError, Object.getOwnPropertyNames(msgError)).substring(0, 1000),
      conversationId: conversation.id,
      leadId: lead.id,
      contactId: contact.id,
      providerMessageId: input.providerMessageId,
    }
    
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: MESSAGE_CREATION - Failed`, errorDetails)
    } else {
      console.error(`❌ [AUTO-MATCH] Failed to create message:`, errorDetails)
    }
    
    throw msgError // Re-throw to prevent silent failure
  }

  // CRITICAL FIX: Update conversation unreadCount and lastMessageAt after message is created
  // This ensures inbox shows new messages immediately
  try {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: input.timestamp || new Date(),
        lastInboundAt: input.timestamp || new Date(),
        unreadCount: {
          increment: 1, // Increment unread count for new inbound message
        },
      },
    })
    console.log(`✅ [AUTO-MATCH] Updated conversation ${conversation.id} unreadCount and lastMessageAt`)
  } catch (updateError: any) {
    console.warn(`⚠️ [AUTO-MATCH] Failed to update conversation unreadCount:`, updateError.message)
    // Non-blocking - continue processing
  }

  /**
   * Parse multiline structured replies
   * Handles patterns like:
   * - 3 lines: name / service / nationality
   * - 4-5 lines: name / service / nationality / expiry / email
   */
  function parseMultilineReply(messageText: string): {
    name?: string
    service?: string
    nationality?: string
    expiry?: string
    email?: string
  } {
    const lines = messageText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length < 2) {
      return {} // Not multiline
    }

    const result: any = {}
    
    // Heuristics for multiline parsing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Email detection
      if (line.includes('@') && line.length >= 5 && line.length <= 100) {
        result.email = line
        continue
      }
      
      // Expiry detection (contains date-like patterns or keywords)
      if (
        (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line) || 
         /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(line) ||
         /expir|valid until|exp|valid/i.test(line)) &&
        line.length <= 50
      ) {
        result.expiry = line
        continue
      }
      
      // Nationality detection (short token, common country names)
      const countryKeywords = ['china', 'usa', 'india', 'pakistan', 'bangladesh', 'philippines', 'egypt', 'syria', 'lebanon', 'jordan', 'nigeria', 'somalia', 'kenya', 'ethiopia', 'british', 'american', 'canadian', 'australian']
      const lineLower = line.toLowerCase()
      if (line.length >= 2 && line.length <= 56 && countryKeywords.some(k => lineLower.includes(k))) {
        result.nationality = line
        continue
      }
      
      // Service detection (contains service keywords)
      const serviceKeywords = ['freelance', 'family visa', 'business', 'visit visa', 'golden visa', 'employment', 'renewal', 'license', 'setup']
      if (serviceKeywords.some(k => lineLower.includes(k))) {
        result.service = line
        continue
      }
      
      // Name detection (contains letters, reasonable length, not already assigned)
      if (!result.name && /[a-zA-Z]/.test(line) && line.length >= 2 && line.length <= 80) {
        result.name = line
        continue
      }
    }
    
    // If we have 3+ lines and no explicit assignments, use positional heuristics
    if (lines.length >= 3 && Object.keys(result).length < 3) {
      // Common pattern: name / service / nationality
      if (!result.name && lines[0].length >= 2 && lines[0].length <= 80 && /[a-zA-Z]/.test(lines[0])) {
        result.name = lines[0]
      }
      if (!result.service && lines[1].length >= 2 && lines[1].length <= 100) {
        result.service = lines[1]
      }
      if (!result.nationality && lines[2].length >= 2 && lines[2].length <= 56) {
        result.nationality = lines[2]
      }
    }
    
    return result
  }

  // Step 6: QUALIFICATION ANSWER CAPTURE - Check if this is a direct answer to a question
  // This handles short replies like "USA" when asked "What is your nationality?"
  let qualificationAnswer: { field: string; value: string } | null = null
  let multilineFields: { name?: string; service?: string; nationality?: string; expiry?: string; email?: string } = {}
  
  try {
    const flowState = await import('../conversation/flowState')
    const state = await flowState.loadFlowState(conversation.id)
    const lastQuestionKey = state.lastQuestionKey || conversation.lastQuestionKey
    
    console.log(`🔍 [QUALIFICATION-CAPTURE] Checking qualification answer`, {
      conversationId: conversation.id,
      lastQuestionKey,
      messageLength: input.text?.trim().length || 0,
      hasMultiline: input.text?.includes('\n') || false,
    })
    
    if (input.text && input.text.trim().length > 0) {
      const messageText = input.text.trim()
      
      // Try multiline parsing first
      if (messageText.includes('\n')) {
        multilineFields = parseMultilineReply(messageText)
        console.log(`📋 [QUALIFICATION-CAPTURE] Multiline parse result:`, multilineFields)
      }
      
      // If we have a lastQuestionKey, check for direct answer
      if (lastQuestionKey) {
        const questionKeyLower = lastQuestionKey.toLowerCase()
        
        // NATIONALITY question
        if (questionKeyLower.includes('nationality') || questionKeyLower === 'ask_nationality' || questionKeyLower === 'nationality') {
          // Use multiline nationality if available, otherwise use full message
          const nationalityValue = multilineFields.nationality || messageText
          // Basic validation: 2-56 chars (increased from 50 to match requirement)
          if (nationalityValue.length >= 2 && nationalityValue.length <= 56) {
            qualificationAnswer = { field: 'nationality', value: nationalityValue }
            console.log(`✅ [QUALIFICATION-CAPTURE] Detected nationality answer: "${nationalityValue}" (from question: ${lastQuestionKey})`)
          }
        }
        // FULL_NAME question
        else if (questionKeyLower.includes('name') || questionKeyLower === 'ask_name' || questionKeyLower === 'name') {
          // Use multiline name if available, otherwise use full message
          const nameValue = multilineFields.name || messageText
          // Basic validation: 2-80 chars, contains letters
          if (nameValue.length >= 2 && nameValue.length <= 80 && /[a-zA-Z]/.test(nameValue)) {
            qualificationAnswer = { field: 'fullName', value: nameValue }
            console.log(`✅ [QUALIFICATION-CAPTURE] Detected name answer: "${nameValue}" (from question: ${lastQuestionKey})`)
          }
        }
        // SERVICE question
        else if (questionKeyLower.includes('service') || questionKeyLower === 'ask_service' || questionKeyLower === 'service') {
          // Use multiline service if available, otherwise use full message
          const serviceValue = multilineFields.service || messageText
          // Basic validation: 2-100 chars
          if (serviceValue.length >= 2 && serviceValue.length <= 100) {
            qualificationAnswer = { field: 'service', value: serviceValue }
            console.log(`✅ [QUALIFICATION-CAPTURE] Detected service answer: "${serviceValue}" (from question: ${lastQuestionKey})`)
          }
        }
      }
    }
  } catch (qualError: any) {
    console.warn(`⚠️ [QUALIFICATION-CAPTURE] Failed to check qualification answer:`, qualError.message)
    // Non-blocking - continue with normal extraction
  }

  // Step 7: AUTO-EXTRACT FIELDS (deterministic)
  let extractedFields: any = {}
  try {
    extractedFields = await extractFields(input.text, contact, lead)
    
    // CRITICAL: If qualification answer was captured, merge it into extractedFields
    // This ensures short replies like "USA" are saved even if extraction heuristics fail
    if (qualificationAnswer) {
      if (qualificationAnswer.field === 'nationality') {
        extractedFields.nationality = qualificationAnswer.value
        console.log(`✅ [QUALIFICATION-CAPTURE] Merged nationality from qualification answer: ${qualificationAnswer.value}`)
      } else if (qualificationAnswer.field === 'fullName') {
        extractedFields.identity = extractedFields.identity || {}
        extractedFields.identity.name = qualificationAnswer.value
        console.log(`✅ [QUALIFICATION-CAPTURE] Merged name from qualification answer: ${qualificationAnswer.value}`)
      } else if (qualificationAnswer.field === 'service') {
        // Try to extract service from the answer text
        const serviceFromAnswer = extractService(qualificationAnswer.value)
        if (serviceFromAnswer) {
          extractedFields.service = serviceFromAnswer
          console.log(`✅ [QUALIFICATION-CAPTURE] Merged service from qualification answer: ${serviceFromAnswer}`)
        } else {
          // Store raw service text if extraction fails
          extractedFields.serviceRaw = qualificationAnswer.value
          console.log(`✅ [QUALIFICATION-CAPTURE] Stored raw service text from qualification answer: ${qualificationAnswer.value}`)
        }
      }
    }
    
    // CRITICAL: Merge multiline fields (even if no lastQuestionKey match)
    // This handles structured replies like "Abdurahman\nBusiness\nChina"
    if (Object.keys(multilineFields).length > 0) {
      if (multilineFields.nationality && !extractedFields.nationality) {
        extractedFields.nationality = multilineFields.nationality
        console.log(`✅ [QUALIFICATION-CAPTURE] Merged nationality from multiline: ${multilineFields.nationality}`)
      }
      if (multilineFields.name && !extractedFields.identity?.name) {
        extractedFields.identity = extractedFields.identity || {}
        extractedFields.identity.name = multilineFields.name
        console.log(`✅ [QUALIFICATION-CAPTURE] Merged name from multiline: ${multilineFields.name}`)
      }
      if (multilineFields.service && !extractedFields.service) {
        const serviceFromMultiline = extractService(multilineFields.service)
        if (serviceFromMultiline) {
          extractedFields.service = serviceFromMultiline
          console.log(`✅ [QUALIFICATION-CAPTURE] Merged service from multiline: ${serviceFromMultiline}`)
        } else {
          extractedFields.serviceRaw = multilineFields.service
          console.log(`✅ [QUALIFICATION-CAPTURE] Stored raw service from multiline: ${multilineFields.service}`)
        }
      }
      if (multilineFields.email && !extractedFields.identity?.email) {
        extractedFields.identity = extractedFields.identity || {}
        extractedFields.identity.email = multilineFields.email
        console.log(`✅ [QUALIFICATION-CAPTURE] Merged email from multiline: ${multilineFields.email}`)
      }
      if (multilineFields.expiry) {
        // Try to extract expiry date from multiline expiry text
        const expiryFromMultiline = extractExpiry(multilineFields.expiry)
        if (expiryFromMultiline && expiryFromMultiline.length > 0) {
          extractedFields.expiries = expiryFromMultiline
          console.log(`✅ [QUALIFICATION-CAPTURE] Merged expiry from multiline: ${expiryFromMultiline[0].date}`)
        }
      }
    }
    
    // CRITICAL: Persist extracted fields to conversation using safe merge
    if (Object.keys(extractedFields).length > 0 && conversation) {
      try {
        const existingKnownFields = conversation.knownFields 
          ? (typeof conversation.knownFields === 'string' 
              ? JSON.parse(conversation.knownFields) 
              : conversation.knownFields)
          : {}
        
        // Use safe merge utility to prevent wiping existing data
        const conversationUpdate = buildConversationUpdateFromExtracted(existingKnownFields, extractedFields)
        
        // Add qualification answer metadata if present
        if (qualificationAnswer) {
          const merged = JSON.parse(conversationUpdate.knownFields as string)
          merged[`qualification_${qualificationAnswer.field}`] = qualificationAnswer.value
          merged.qualificationAnswerAt = new Date().toISOString()
          conversationUpdate.knownFields = JSON.stringify(merged)
        }
        
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: conversationUpdate,
        })
        console.log(`✅ [AUTO-MATCH] Persisted extracted fields to conversation.knownFields (safe merge)`)
      } catch (persistError: any) {
        console.warn(`⚠️ [AUTO-MATCH] Failed to persist to conversation.knownFields:`, persistError.message)
      }
    }
  } catch (extractError: any) {
    console.error(`❌ [AUTO-MATCH] Field extraction failed:`, extractError.message)
    // Continue with empty extractedFields - don't block pipeline
    extractedFields = {}
  }

  // CRITICAL FIX: Build lead update using safe merge utility
  // This ensures we never wipe existing fields
  const leadUpdate = buildLeadUpdateFromExtracted(extractedFields)
  const updateData: any = { ...leadUpdate }

  // Update Contact with extracted nationality if needed
  if (extractedFields.nationality) {
    // Fetch full contact to check nationality
    const fullContact = await prisma.contact.findUnique({
      where: { id: contact.id },
      select: { nationality: true },
    })
    
    // Update if missing or if this is a qualification answer (always update for qualification answers)
    if (!fullContact?.nationality || qualificationAnswer?.field === 'nationality') {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { nationality: extractedFields.nationality },
      })
      console.log(`✅ [AUTO-MATCH] Updated contact nationality: ${extractedFields.nationality}${qualificationAnswer?.field === 'nationality' ? ' (from qualification answer)' : ''}`)
    }
  }
  
  // Update Contact with extracted name if needed (from qualification answer)
  if (qualificationAnswer?.field === 'fullName' && extractedFields.identity?.name) {
    const fullContact = await prisma.contact.findUnique({
      where: { id: contact.id },
      select: { fullName: true },
    })
    
    // Update if missing or if name is generic/unknown
    if (!fullContact?.fullName || 
        fullContact.fullName === 'Unknown' || 
        fullContact.fullName.startsWith('Contact +')) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { fullName: extractedFields.identity.name },
      })
      console.log(`✅ [AUTO-MATCH] Updated contact name from qualification answer: ${extractedFields.identity.name}`)
    }
  }

  // CRITICAL FIX: Use safe merge utility to prevent data wiping
  // Update dataJson (append, don't overwrite)
  const existingData = lead.dataJson ? JSON.parse(lead.dataJson) : {}
  const incomingData = {
    service: extractedFields.service,
    nationality: extractedFields.nationality,
    expiries: extractedFields.expiries,
    counts: extractedFields.counts,
    identity: extractedFields.identity,
    businessActivityRaw: extractedFields.businessActivityRaw,
    extractedAt: new Date().toISOString(),
  }
  // Use safe merge to preserve existing values
  const updatedData = mergeJsonSafe(existingData, incomingData)
  
  // CRITICAL FIX: Store business setup specific data from rule engine memory
  // This ensures partners, visas, timeline, license_type, business_activity are saved
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { leadId: lead.id, channel: input.channel.toLowerCase() },
      select: { ruleEngineMemory: true },
    })
    
    if (conversation?.ruleEngineMemory) {
      const memory = JSON.parse(conversation.ruleEngineMemory)
      
      // Store business setup fields
      if (memory.license_type) {
        updatedData.license_type = memory.license_type
      }
      if (memory.business_activity) {
        updatedData.business_activity = memory.business_activity
        // Also update businessActivityRaw if not already set
        if (!extractedFields.businessActivityRaw) {
          updatedData.businessActivityRaw = memory.business_activity
        }
      }
      if (memory.partners_count !== undefined) {
        updatedData.partners_count = memory.partners_count
        // Also update counts
        updatedData.counts = {
          ...updatedData.counts,
          partners: memory.partners_count,
        }
      }
      if (memory.visas_count !== undefined) {
        updatedData.visas_count = memory.visas_count
        // Also update counts
        updatedData.counts = {
          ...updatedData.counts,
          visas: memory.visas_count,
        }
      }
      if (memory.timeline_intent) {
        updatedData.timeline_intent = memory.timeline_intent
      }
      if (memory.name && (!contact.fullName || contact.fullName === 'Unknown' || contact.fullName.startsWith('Contact +'))) {
        // Update contact name if extracted
        await prisma.contact.update({
          where: { id: contact.id },
          data: { fullName: memory.name },
        })
        console.log(`✅ [AUTO-MATCH] Updated contact name from rule engine: ${memory.name}`)
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ [AUTO-MATCH] Failed to read rule engine memory:`, error.message)
  }
  
  // Store expiry hint if present (expiry mentioned but no explicit date)
  if (extractedFields.expiryHint) {
    updatedData.expiry_hint_text = extractedFields.expiryHint
    console.log(`📝 [AUTO-MATCH] Stored expiry hint: "${extractedFields.expiryHint}"`)
  }
  
  // PROBLEM B FIX: Always update lead with latest data IMMEDIATELY
  // This ensures lead fields are auto-filled as soon as user mentions service/activity
  // Note: updateData was already initialized above after extraction
  
  // Set dataJson from safely merged updatedData
  // Only update if we have new data to merge
  if (Object.keys(updatedData).length > 0 || Object.keys(existingData).length > 0) {
    updateData.dataJson = JSON.stringify(updatedData)
  }
  
  // CRITICAL: Only add fields to updateData if they have real values (prevent wiping)
  // Service matching and raw text extraction
  if (input.text && input.text.trim().length > 0) {
    // Try to find service keywords in the message
    const serviceKeywords = ['freelance', 'family visa', 'golden visa', 'business setup', 'business license', 'trading license', 'company license', 'pro', 'accounting', 'renewal', 'visit visa', 'employment visa', 'investor visa']
    const lowerText = input.text.toLowerCase()
    for (const keyword of serviceKeywords) {
      if (lowerText.includes(keyword)) {
        // Extract the phrase containing the keyword (up to 50 chars)
        const keywordIndex = lowerText.indexOf(keyword)
        const start = Math.max(0, keywordIndex - 20)
        const end = Math.min(lowerText.length, keywordIndex + keyword.length + 30)
        const rawService = input.text.substring(start, end).trim()
        // Only set if lead doesn't already have a value (preserve existing)
        if (!lead.requestedServiceRaw || lead.requestedServiceRaw.trim() === '') {
          updateData.requestedServiceRaw = rawService
          console.log(`✅ [AUTO-MATCH] Setting requestedServiceRaw: ${rawService}`)
        }
        break
      }
    }
  }
  
  // Match service to ServiceType and set serviceTypeId (only if serviceTypeEnum is set)
  if (updateData.serviceTypeEnum) {
    try {
      const serviceLower = updateData.serviceTypeEnum.toLowerCase()
      const serviceSpaces = updateData.serviceTypeEnum.replace(/_/g, ' ').toLowerCase()
      
      const allServiceTypes = await prisma.serviceType.findMany({
        where: { isActive: true },
      })
      
      const serviceType = allServiceTypes.find(st => {
        const nameLower = (st.name || '').toLowerCase()
        const codeLower = (st.code || '').toLowerCase()
        return (
          nameLower.includes(serviceLower) ||
          nameLower.includes(serviceSpaces) ||
          codeLower === serviceLower ||
          nameLower === serviceLower ||
          nameLower === serviceSpaces
        )
      })
      
      if (serviceType) {
        updateData.serviceTypeId = serviceType.id
        console.log(`✅ [AUTO-MATCH] Matched serviceTypeId: ${serviceType.id} (${serviceType.name})`)
      } else {
        console.log(`⚠️ [AUTO-MATCH] No ServiceType match found for: ${updateData.serviceTypeEnum}`)
      }
    } catch (error: any) {
      console.warn(`⚠️ [AUTO-MATCH] Failed to match ServiceType:`, error.message)
    }
  }
  
  // CRITICAL FIX: Only update lead if we have actual data to update
  // Remove any undefined/null values to prevent wiping
  const cleanUpdateData: any = {}
  for (const key in updateData) {
    if (updateData[key] !== undefined && updateData[key] !== null) {
      cleanUpdateData[key] = updateData[key]
    }
  }
  
  if (Object.keys(cleanUpdateData).length > 0) {
    try {
      await prisma.lead.update({
        where: { id: lead.id },
        data: cleanUpdateData,
      })
      
      console.log(`✅ [AUTO-MATCH] Updated lead ${lead.id} (safe merge):`, {
        serviceTypeEnum: cleanUpdateData.serviceTypeEnum || lead.serviceTypeEnum || 'none',
        serviceTypeId: cleanUpdateData.serviceTypeId || lead.serviceTypeId || 'none',
        requestedServiceRaw: cleanUpdateData.requestedServiceRaw || lead.requestedServiceRaw || 'none',
        businessActivityRaw: cleanUpdateData.businessActivityRaw || lead.businessActivityRaw || 'none',
        hasDataJson: !!cleanUpdateData.dataJson,
        keys: Object.keys(cleanUpdateData),
      })
    } catch (updateError: any) {
      console.error(`❌ [AUTO-MATCH] Failed to update lead ${lead.id}:`, {
        error: updateError.message,
        updateData: Object.keys(cleanUpdateData),
        stack: updateError.stack,
      })
      // Don't throw - continue pipeline even if lead update fails
    }
  } else {
    console.log(`⚠️ [AUTO-MATCH] No fields extracted - skipping lead update to prevent wiping existing data`)
  }

  // CRITICAL: Advance flow state after successfully capturing qualification answer
  // This prevents the bot from asking the same question again
  if (qualificationAnswer) {
    try {
      const flowState = await import('../conversation/flowState')
      const { updateFlowState } = flowState
      
      // Clear lastQuestionKey to advance the flow
      // The next bot reply will ask the NEXT missing field, not the same one
      // CRITICAL: Use null to explicitly clear (not undefined, which Prisma ignores)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastQuestionKey: null,
          lastQuestionAt: null,
        },
      })
      console.log(`✅ [QUALIFICATION-CAPTURE] Cleared lastQuestionKey in conversation table`)
      
      // Also update conversation state machine (if using state machine)
      try {
        const { updateConversationState, loadConversationState } = await import('../ai/stateMachine')
        const currentState = await loadConversationState(conversation.id)
        
        // Update knownFields in state machine
        const updatedKnownFields = {
          ...currentState.knownFields,
        }
        
        if (qualificationAnswer.field === 'nationality') {
          updatedKnownFields.nationality = qualificationAnswer.value
        } else if (qualificationAnswer.field === 'fullName') {
          updatedKnownFields.name = qualificationAnswer.value
        } else if (qualificationAnswer.field === 'service') {
          updatedKnownFields.service = qualificationAnswer.value
        }
        
        await updateConversationState(conversation.id, {
          knownFields: updatedKnownFields,
        }, currentState.stateVersion)
        
        console.log(`✅ [QUALIFICATION-CAPTURE] Advanced flow state - cleared lastQuestionKey, updated knownFields`)
      } catch (stateMachineError: any) {
        console.warn(`⚠️ [QUALIFICATION-CAPTURE] Failed to update state machine:`, stateMachineError.message)
        // Non-blocking - flow state update above should be sufficient
      }
      
      console.log(`✅ [QUALIFICATION-CAPTURE] Flow advanced - lastQuestionKey cleared, next reply will ask next missing field`)
    } catch (flowError: any) {
      console.warn(`⚠️ [QUALIFICATION-CAPTURE] Failed to advance flow state:`, flowError.message)
      // Non-blocking - continue pipeline
    }
  }

  // Step 6.5: Recompute deal forecast (non-blocking)
  try {
    const { recomputeAndSaveForecast } = await import('../forecast/dealForecast')
    // Run in background - don't block pipeline
    recomputeAndSaveForecast(lead.id).catch((err) => {
      console.warn(`⚠️ [FORECAST] Failed to recompute forecast for lead ${lead.id}:`, err.message)
    })
  } catch (err) {
    // Forecast module not critical - continue
    console.warn(`⚠️ [FORECAST] Forecast module not available`)
  }

  // Step 7: AUTO-CREATE TASKS/ALERTS
  // SYNC ORDER: Tasks created AFTER lead/conversation updates
  // This ensures tasks reference the correct lead state
  const tasksCreated = await createAutoTasks({
    leadId: lead.id,
    conversationId: conversation.id,
    channel: input.channel,
    service: extractedFields.service,
    expiries: extractedFields.expiries,
    expiryHint: extractedFields.expiryHint,
    providerMessageId: input.providerMessageId,
  })
  
  // SYNC GUARANTEE: All updates complete in single pipeline run
  // - Conversation knownFields updated (Step 6)
  // - Lead fields updated (Step 6)
  // - Contact fields updated (Step 6)
  // - Tasks created (Step 7)
  // - Notifications will be created by separate background job if needed

  // Step 8: AUTO-REPLY (optional)
  // Note: Auto-reply is handled by the webhook handler after this pipeline completes
  // This ensures proper idempotency and logging at the webhook level
  // The webhook handler will call handleInboundAutoReply separately
  let autoReplied = false
  // Auto-reply will be handled by the webhook handler (see webhook route.ts)
  
  // Note: The pipeline does NOT call handleInboundAutoReply here because:
  // 1. Webhook handler needs to control timeout (4s)
  // 2. Webhook handler needs to update markInboundProcessed
  // 3. Webhook handler needs to create tasks on timeout

  console.log(`✅ [AUTO-MATCH] Pipeline completed`, {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId: lead.id,
    messageId: message.id,
    tasksCreated,
    autoReplied,
    elapsed: `${Date.now() - startTime}ms`,
  })

  // Trigger lead scoring for inbound messages (fire-and-forget)
  // Only trigger if message is inbound and linked to a lead
  // Note: message.direction is normalized to 'INBOUND' or 'OUTBOUND' in createCommunicationLog
  if (message && lead && lead.id && message.direction === 'INBOUND') {
    try {
      const { triggerLeadScoring } = await import('@/lib/ai/scoreTrigger')
      // Fire-and-forget - don't await, runs in background
      triggerLeadScoring(lead.id, 'inbound_message', conversation?.id).catch((err) => {
        console.warn(`[AUTO-MATCH] Failed to trigger scoring for lead ${lead.id}:`, err.message)
      })
    } catch (error: any) {
      // Silent fail - don't block pipeline
      console.warn(`[AUTO-MATCH] Error importing scoreTrigger:`, error.message)
    }
  }

  // Log successful completion
  const duration = Date.now() - startTime
  
  if (isInstagram) {
    console.log(`✅ [AUTO-MATCH-INSTAGRAM] Instagram message pipeline completed successfully`, {
      duration: `${duration}ms`,
      conversationId: conversation.id,
      messageId: message.id,
      contactId: contact.id,
      leadId: lead.id,
      channel: input.channel.toLowerCase(), // Stored as lowercase
    })
  } else {
    console.log(`✅ [AUTO-MATCH] Pipeline completed successfully`, {
      duration: `${duration}ms`,
      conversationId: conversation.id,
      messageId: message.id,
      channel: input.channel.toLowerCase(),
    })
  }

  return {
    contact,
    conversation,
    lead,
    message,
    extractedFields,
    tasksCreated,
    autoReplied,
    wasDuplicate: false,
  }
}

/**
 * Step 1: Check inbound deduplication
 */
async function checkInboundDedupe(
  channel: string,
  providerMessageId: string
): Promise<boolean> {
  const normalizedChannel = normalizeChannel(channel)
  const isInstagram = normalizedChannel === 'instagram'
  
  try {
    await prisma.inboundMessageDedup.create({
      data: {
        provider: normalizedChannel,
        providerMessageId,
        processingStatus: 'PROCESSING',
      },
    })
    if (isInstagram) {
      console.log(`✅ [AUTO-MATCH-INSTAGRAM] Dedupe check passed - not a duplicate`, {
        channel: normalizedChannel,
        providerMessageId,
      })
    }
    return false // Not duplicate
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Unique constraint violation = duplicate
      if (isInstagram) {
        console.log(`ℹ️ [AUTO-MATCH-INSTAGRAM] Duplicate message detected in dedupe check`, {
          channel: normalizedChannel,
          providerMessageId,
        })
      }
      return true
    }
    // Log non-duplicate errors (database issues, etc.)
    console.error(`❌ [AUTO-MATCH] Error in dedupe check (non-duplicate error):`, {
      channel: normalizedChannel,
      providerMessageId,
      errorCode: error.code,
      errorMessage: error.message,
    })
    throw error
  }
}

/**
 * Step 2: Find or create Contact
 * NOTE: Now using upsertContact from ../contact/upsert for proper normalization and deduplication
 */

/**
 * Step 3: Find or create Conversation
 * STEP 3: CRITICAL FIX - Use upsert to enforce uniqueness and prevent duplicates
 * Enforces one conversation per (contactId, channel) via unique constraint
 */
async function findOrCreateConversation(input: {
  contactId: number
  channel: string
  leadId: number
  timestamp?: Date
  externalThreadId?: string | null
}): Promise<any> {
  // Use centralized upsertConversation function
  const { id } = await upsertConversation({
    contactId: input.contactId,
    channel: input.channel,
    leadId: input.leadId,
    externalThreadId: input.externalThreadId,
    timestamp: input.timestamp,
    status: 'open',
  })
  
  // Fetch full conversation record
  let conversation
  try {
    conversation = await prisma.conversation.findUnique({
      where: { id },
    })
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
      // Use select to explicitly exclude the problematic column
      conversation = await prisma.conversation.findUnique({
        where: { id },
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
        },
      }) as any
    } else {
      throw error
    }
  }
  
  if (!conversation) {
    throw new Error(`Failed to fetch conversation ${id} after upsert`)
  }
  
  console.log(`✅ [AUTO-MATCH] Ensured conversation ${conversation.id} for contact ${input.contactId}, channel ${normalizeChannel(input.channel)}, lead ${input.leadId}`)
  return conversation
}

/**
 * Step 4: Find or create Lead (smart rules)
 */
async function findOrCreateLead(input: {
  contactId: number
  channel: string
  providerMessageId: string
  timestamp?: Date
}): Promise<any> {
  const isInstagram = input.channel.toLowerCase() === 'instagram'
  const logContext = {
    contactId: input.contactId,
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp?.toISOString() || 'N/A',
  }
  
  if (isInstagram) {
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Starting`, logContext)
  }
  
  try {
  // BUG FIX: Use actual message timestamp instead of webhook processing time
    // Use let to allow reassignment if validation fails
    let messageTimestamp = input.timestamp || new Date()
    
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Starting`, {
        contactId: input.contactId,
      })
    }
    
  // Check if this providerMessageId already linked to a lead (idempotency)
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Checking existing message`, {
        providerMessageId: input.providerMessageId,
      })
    }
    
  const existingMessage = await prisma.message.findFirst({
    where: {
      providerMessageId: input.providerMessageId,
    },
    include: { lead: true },
  })

  if (existingMessage?.lead) {
      if (isInstagram) {
        console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Message already linked to lead`, {
          messageId: existingMessage.id,
          leadId: existingMessage.lead.id,
        })
      } else {
    console.log(`✅ [AUTO-MATCH] Message already linked to lead: ${existingMessage.lead.id}`)
      }
    return existingMessage.lead
  }

  // Find open lead (not Won/Lost/Cold) created within last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Searching for open lead`, {
        contactId: input.contactId,
        thirtyDaysAgo: thirtyDaysAgo.toISOString(),
      })
    }

  const openLead = await prisma.lead.findFirst({
    where: {
      contactId: input.contactId,
      stage: {
        notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
      },
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (openLead) {
      if (isInstagram) {
        console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Found open lead`, {
          leadId: openLead.id,
          stage: openLead.stage,
        })
      } else {
    console.log(`✅ [AUTO-MATCH] Found open lead: ${openLead.id}`)
      }
      
    // CRITICAL FIX: Link conversations to this lead if not already linked
      try {
    await prisma.conversation.updateMany({
      where: {
        contactId: input.contactId,
        OR: [
          { leadId: null },
          { leadId: { not: openLead.id } },
        ],
      },
      data: {
        leadId: openLead.id,
      },
    })
      } catch (linkError: any) {
        if (isInstagram) {
          console.warn(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Failed to link conversations`, {
            error: linkError.message,
            errorName: linkError.name,
            errorCode: linkError.code,
            leadId: openLead.id,
          })
        }
        // Continue - not critical
      }
      
    // Update lastInboundAt with actual message timestamp
      try {
    await prisma.lead.update({
      where: { id: openLead.id },
      data: { lastInboundAt: messageTimestamp },
    })
      } catch (updateError: any) {
        if (isInstagram) {
          console.warn(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Failed to update lead`, {
            error: updateError.message,
            errorName: updateError.name,
            errorCode: updateError.code,
            leadId: openLead.id,
          })
        }
        // Continue - not critical
      }
      
    return openLead
  }

  // Create new lead
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Creating new lead`, {
      contactId: input.contactId,
        channel: input.channel.toLowerCase(),
        messageTimestamp: messageTimestamp.toISOString(),
      })
    }
    
    // Validate lead creation requirements before attempting to create
    // Ensure contactId exists and is valid
    if (!input.contactId || input.contactId <= 0 || !Number.isInteger(input.contactId)) {
      const errorMsg = `Invalid contactId: ${input.contactId} (must be positive integer)`
      if (isInstagram) {
        console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Validation failed`, {
          error: errorMsg,
          errorName: 'ValidationError',
          contactId: input.contactId,
          contactIdType: typeof input.contactId,
        })
      }
      throw new Error(errorMsg)
    }
    
    // Verify contact exists in database before creating lead
    let contactExists = false
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, fullName: true, phone: true },
      })
      contactExists = !!contact
      
      if (isInstagram) {
        console.log(`🔍 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Contact verification`, {
          contactId: input.contactId,
          exists: contactExists,
          contactName: contact?.fullName || 'N/A',
          contactPhone: contact?.phone || 'N/A',
        })
      }
      
      if (!contactExists) {
        const errorMsg = `Contact ${input.contactId} does not exist in database`
        if (isInstagram) {
          console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Contact not found`, {
            error: errorMsg,
            contactId: input.contactId,
          })
        }
        throw new Error(errorMsg)
      }
    } catch (contactError: any) {
      // Re-throw validation errors
      if (contactError.message?.includes('does not exist')) {
        throw contactError
      }
      // Log database errors but continue (might be transient)
      console.error(`⚠️ [AUTO-MATCH] Failed to verify contact existence:`, contactError.message)
      if (isInstagram) {
        console.error(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Contact verification failed (continuing)`, {
          error: contactError.message,
          contactId: input.contactId,
        })
      }
    }
    
    // Ensure channel is valid
    const validChannels = ['whatsapp', 'instagram', 'facebook', 'email', 'webchat']
    const channelLower = (input.channel || '').toLowerCase().trim()
    if (!channelLower || !validChannels.includes(channelLower)) {
      const errorMsg = `Invalid channel: ${input.channel}`
      if (isInstagram) {
        console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Validation failed`, {
          error: errorMsg,
          errorName: 'ValidationError',
          channel: input.channel,
        })
      }
      throw new Error(errorMsg)
    }
    
    // Validate messageTimestamp is valid Date
    if (!(messageTimestamp instanceof Date) || isNaN(messageTimestamp.getTime())) {
      const errorMsg = `Invalid messageTimestamp: ${messageTimestamp} (must be valid Date object)`
      if (isInstagram) {
        console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Validation failed`, {
          error: errorMsg,
          errorName: 'ValidationError',
          messageTimestamp,
          messageTimestampType: typeof messageTimestamp,
        })
      }
      // Fallback to current date if invalid
      messageTimestamp = new Date()
      if (isInstagram) {
        console.warn(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Using current date as fallback`, {
          fallbackTimestamp: messageTimestamp.toISOString(),
        })
      }
    }
    
    if (isInstagram) {
      console.log(`📸 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Validation passed, creating lead`, {
        contactId: input.contactId,
        channel: channelLower,
        messageTimestamp: messageTimestamp.toISOString(),
      })
    }
    
    // Prepare lead data with defensive validation
    // Ensure all fields are valid types before Prisma call
    const leadData = {
      contactId: Number(input.contactId), // Explicitly convert to number
      stage: 'NEW' as const, // Valid enum value
      status: 'new', // Valid string (legacy field)
      pipelineStage: 'new', // Valid string (legacy field)
      lastContactChannel: channelLower || null, // Must be lowercase or null
      lastInboundAt: messageTimestamp instanceof Date && !isNaN(messageTimestamp.getTime()) 
        ? messageTimestamp 
        : new Date(), // Ensure valid Date object
    }
    
    // Final validation of leadData structure before Prisma call
    if (isInstagram) {
      console.log(`🔍 [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Lead data prepared`, {
        contactId: leadData.contactId,
        contactIdType: typeof leadData.contactId,
        stage: leadData.stage,
        status: leadData.status,
        pipelineStage: leadData.pipelineStage,
        lastContactChannel: leadData.lastContactChannel,
        lastInboundAt: leadData.lastInboundAt?.toISOString(),
        lastInboundAtType: leadData.lastInboundAt instanceof Date ? 'Date' : typeof leadData.lastInboundAt,
      })
    }
    
    console.log(`🔍 [AUTO-MATCH] IMMEDIATELY BEFORE prisma.lead.create()`, {
      leadData,
      isInstagram,
    })
    
    let newLead
    try {
      newLead = await prisma.lead.create({
        data: leadData,
      })
      
      console.log(`✅ [AUTO-MATCH] IMMEDIATELY AFTER prisma.lead.create() - SUCCESS`, {
        leadId: newLead?.id || 'NULL',
        leadStage: newLead?.stage || 'NULL',
        leadContactId: newLead?.contactId || 'NULL',
        hasLead: !!newLead,
        leadType: typeof newLead,
        isInstagram,
      })
      
      if (isInstagram) {
        console.log(`✅ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Lead created successfully`, {
          leadId: newLead.id,
          contactId: newLead.contactId,
          stage: newLead.stage,
        })
      } else {
        console.log(`✅ [AUTO-MATCH] Created new lead: ${newLead.id} and linked existing conversations`)
      }
    } catch (createError: any) {
      // Capture full Prisma error details without truncation
      const prismaError = {
        message: createError.message || 'Unknown error',
        code: createError.code || 'NO_CODE', // Prisma error code (e.g., P2002, P2003)
        meta: createError.meta || null, // Field names that failed validation
        clientVersion: createError.clientVersion || 'unknown',
        stack: createError.stack || 'No stack trace',
      }
      
      // Log full error without truncation for Prisma errors
      console.error(`❌ [AUTO-MATCH] IMMEDIATELY AFTER prisma.lead.create() - ERROR`, {
        ...prismaError,
        leadData,
        isInstagram,
        contactId: input.contactId,
        channel: channelLower,
        messageTimestamp: messageTimestamp?.toISOString() || 'INVALID',
      })
      
      // Log full Prisma error as JSON for detailed analysis
      try {
        const fullPrismaError = JSON.stringify(prismaError, null, 2)
        console.error(`❌ [AUTO-MATCH] FULL PRISMA ERROR (JSON):`, fullPrismaError)
      } catch (jsonError) {
        console.error(`❌ [AUTO-MATCH] Failed to serialize Prisma error:`, jsonError)
      }
      
      if (isInstagram) {
        console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Prisma lead.create() failed`, {
          prismaCode: prismaError.code,
          prismaMeta: prismaError.meta,
          prismaMessage: prismaError.message,
          leadData,
          contactId: input.contactId,
          channel: channelLower,
        })
      }
      
      // Re-throw to trigger outer catch block
      throw createError
    }
  
  // CRITICAL FIX: Link all existing conversations for this contact to the new lead
    try {
  await prisma.conversation.updateMany({
    where: {
      contactId: input.contactId,
      leadId: null, // Only update conversations not linked to a lead
    },
    data: {
      leadId: newLead.id,
    },
  })
    } catch (linkError: any) {
      if (isInstagram) {
        console.warn(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Failed to link conversations to new lead`, {
          error: linkError.message,
          errorName: linkError.name,
          errorCode: linkError.code,
          leadId: newLead.id,
        })
      }
      // Continue - not critical
    }
  
  // Update contact source if not set
    try {
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      source: input.channel.toLowerCase(),
    },
  })
    } catch (updateError: any) {
      if (isInstagram) {
        console.warn(`⚠️ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Failed to update contact source`, {
          error: updateError.message,
          errorName: updateError.name,
          errorCode: updateError.code,
          contactId: input.contactId,
        })
      }
      // Continue - not critical
    }

  return newLead
  } catch (error: any) {
    // Capture full error object for debugging
    const errorDetails = {
      error: error.message || 'Unknown error',
      errorName: error.name || 'UnknownError',
      errorCode: error.code || 'NO_CODE',
      errorStack: error.stack?.substring(0, 1000) || 'No stack trace',
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000),
      ...logContext,
    }
    
    if (isInstagram) {
      console.error(`❌ [AUTO-MATCH-INSTAGRAM] Step: FIND_OR_CREATE_LEAD - Error occurred`, errorDetails)
    } else {
      console.error(`❌ [AUTO-MATCH] Error in findOrCreateLead:`, errorDetails)
    }
    
    // Re-throw to prevent silent failure
    throw error
  }
}

/**
 * Create minimal Instagram lead with only required fields
 * This is a fallback when full lead creation fails
 */
export async function createInstagramLeadMinimal(contactId: number): Promise<any | null> {
  console.log('📸 [INSTAGRAM-LEAD-MINIMAL] Attempting to create minimal lead', {
    contactId,
    contactIdType: typeof contactId,
  })

  // Validate contactId
  if (!contactId || typeof contactId !== 'number' || contactId <= 0 || !Number.isInteger(contactId)) {
    console.error('❌ [INSTAGRAM-LEAD-MINIMAL] Invalid contactId', {
      contactId,
      contactIdType: typeof contactId,
      isValidNumber: typeof contactId === 'number',
      isPositive: contactId > 0,
      isInteger: Number.isInteger(contactId),
    })
    return null
  }

  // Verify contact exists in database
  try {
    const contactExists = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    })
    if (!contactExists) {
      console.error('❌ [INSTAGRAM-LEAD-MINIMAL] Contact does not exist', { contactId })
      return null
    }
  } catch (dbError: any) {
    console.error('❌ [INSTAGRAM-LEAD-MINIMAL] Failed to verify contact existence', {
      contactId,
      error: dbError.message,
    })
    return null
  }

  // Prepare minimal lead data - ONLY required fields
  const minimalLeadData = {
    contactId: contactId, // Required
    stage: 'NEW' as const, // Default enum value
    status: 'new', // Default string (legacy field)
    pipelineStage: 'new', // Default string (legacy field)
    lastContactChannel: 'instagram', // Lowercase channel name
  }

  console.log('🔍 [INSTAGRAM-LEAD-MINIMAL] Minimal lead data prepared', {
    contactId: minimalLeadData.contactId,
    stage: minimalLeadData.stage,
    status: minimalLeadData.status,
    pipelineStage: minimalLeadData.pipelineStage,
    lastContactChannel: minimalLeadData.lastContactChannel,
  })

  try {
    const minimalLead = await prisma.lead.create({
      data: minimalLeadData,
    })

    console.log('✅ [INSTAGRAM-LEAD-MINIMAL] Minimal lead created successfully', {
      leadId: minimalLead.id,
      contactId: minimalLead.contactId,
      stage: minimalLead.stage,
    })

    return minimalLead
  } catch (createError: any) {
    // Capture full Prisma error details
    const prismaError = {
      message: createError.message || 'Unknown error',
      code: createError.code || 'NO_CODE',
      meta: createError.meta || null,
      clientVersion: createError.clientVersion || 'unknown',
      stack: createError.stack || 'No stack trace',
    }

    console.error('❌ [INSTAGRAM-LEAD-MINIMAL] Failed to create minimal lead', {
      ...prismaError,
      minimalLeadData,
      contactId,
    })

    // Log full Prisma error as JSON
    try {
      const fullPrismaError = JSON.stringify(prismaError, null, 2)
      console.error('❌ [INSTAGRAM-LEAD-MINIMAL] FULL PRISMA ERROR (JSON):', fullPrismaError)
    } catch (jsonError) {
      console.error('❌ [INSTAGRAM-LEAD-MINIMAL] Failed to serialize Prisma error:', jsonError)
    }

    // Return null - don't throw, allow pipeline to continue
    return null
  }
}

/**
 * Step 5: Create CommunicationLog (Message record + CommunicationLog)
 */
async function createCommunicationLog(input: {
  conversationId: number
  leadId: number
  contactId: number
  channel: string
  direction: 'in' | 'out'
  text: string
  providerMessageId: string
  timestamp: Date
  metadata?: {
    mediaUrl?: string | null
    mediaMimeType?: string | null
    filename?: string | null
    [key: string]: any
  }
}): Promise<any> {
  // CRITICAL FIX: Include contactId to ensure proper linking
  // PROBLEM FIX: Normalize direction to INBOUND/OUTBOUND (not IN/OUT)
  const normalizedDirection = input.direction.toUpperCase() === 'IN' ? 'INBOUND' : 
                               input.direction.toUpperCase() === 'OUT' ? 'OUTBOUND' :
                               input.direction.toUpperCase()
  
  // CRITICAL: Normalize channel to lowercase for consistency
  const normalizedChannel = normalizeChannel(input.channel)
  
  // PHASE C: Use canonical media resolver (single source of truth)
  // Build dbMessage-like object from available metadata
  const dbMessage = {
    type: input.metadata?.messageType || null,
    body: input.text || null,
    providerMediaId: input.metadata?.providerMediaId || null,
    mediaUrl: input.metadata?.mediaUrl || null,
    mediaMimeType: input.metadata?.mediaMimeType || null,
    rawPayload: input.metadata?.rawPayload || null,
    payload: input.metadata?.payload || null,
    providerMessageId: input.providerMessageId || null,
  }
  
  const resolved = resolveWhatsAppMedia(undefined, dbMessage, undefined, input.metadata)
  
  // Set fields from resolver
  let providerMediaId = resolved.providerMediaId
  let mediaMimeType = resolved.mediaMimeType
  const finalMessageType = resolved.finalType
  const mediaFilename = resolved.filename
  const mediaSize = resolved.size
  const mediaSha256 = resolved.sha256
  const mediaCaption = resolved.caption
  
  // Legacy compatibility: also set mediaUrl (same as providerMediaId)
  const mediaUrl = providerMediaId
  
  // Log media resolution
  console.log('[AUTO-MATCH][MEDIA-RESOLVED]', { 
    providerMessageId: input.providerMessageId, 
    finalType: finalMessageType, 
    hasId: !!providerMediaId, 
    source: resolved.debug?.source 
  })
  
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:createCommunicationLog',message:'Extracting media from metadata',data:{hasMetadata:!!input.metadata,providerMediaId,mediaUrl,mediaUrlType:typeof mediaUrl,mediaMimeType,mediaFilename,metadataKeys:input.metadata?Object.keys(input.metadata):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I3'})}).catch(()=>{});
  } catch (e) {}
  // #endregion
  
  // PHASE C: Diagnostic log for media ingestion
  console.log('[MEDIA]', JSON.stringify({
    messageId: 'pending', // Will be set after creation
    providerMediaId: providerMediaId, // Meta Graph API media ID (REQUIRED)
    mediaType: mediaMimeType ? (mediaMimeType.startsWith('audio/') ? 'audio' : 
                                mediaMimeType.startsWith('image/') ? 'image' : 
                                mediaMimeType.startsWith('video/') ? 'video' : 
                                mediaMimeType.includes('pdf') || mediaMimeType.includes('document') ? 'document' : 'unknown') : null,
    mediaMimeType: mediaMimeType,
    mediaFilename: mediaFilename,
    hasProviderMediaId: !!providerMediaId,
  }))
  
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:createCommunicationLog',message:'Creating message with media',data:{mediaUrl,mediaMimeType,finalMessageType,hasMediaUrl:!!mediaUrl,hasMediaMimeType:!!mediaMimeType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I1'})}).catch(()=>{});
  } catch (e) {}
  // #endregion
  
  // CRITICAL: Store rawPayload for media recovery
  // ALWAYS try to store rawPayload, even if it seems invalid
  let rawPayload: string | null = null
  if (input.metadata?.rawPayload) {
    try {
      if (typeof input.metadata.rawPayload === 'string') {
        rawPayload = input.metadata.rawPayload
        // Validate it's not just empty string or 'null'/'undefined' strings
        if (rawPayload.trim() === '' || rawPayload === 'null' || rawPayload === 'undefined') {
          console.warn(`⚠️ [AUTO-MATCH] rawPayload is empty/invalid string: ${rawPayload}`)
          rawPayload = null
        } else {
          // Validate it's valid JSON
          try {
            JSON.parse(rawPayload)
            // Valid JSON - keep it
          } catch (e) {
            console.warn(`⚠️ [AUTO-MATCH] rawPayload is not valid JSON, storing anyway for recovery: ${e}`)
            // Still store it - might be recoverable
          }
        }
      } else if (input.metadata.rawPayload && typeof input.metadata.rawPayload === 'object') {
        // It's an object - stringify it
        rawPayload = JSON.stringify(input.metadata.rawPayload)
        // Validate the stringified result
        if (!rawPayload || rawPayload.trim() === '' || rawPayload === 'null' || rawPayload === 'undefined') {
          console.warn(`⚠️ [AUTO-MATCH] rawPayload stringified to invalid value: ${rawPayload}`)
          rawPayload = null
        }
      } else {
        // Try to convert to string as last resort
        rawPayload = String(input.metadata.rawPayload)
        if (rawPayload === 'null' || rawPayload === 'undefined' || rawPayload.trim() === '') {
          rawPayload = null
        }
      }
    } catch (e: any) {
      console.error(`❌ [AUTO-MATCH] Failed to process rawPayload: ${e.message}`, {
        rawPayloadType: typeof input.metadata.rawPayload,
        rawPayloadValue: input.metadata.rawPayload,
        rawPayloadKeys: input.metadata.rawPayload && typeof input.metadata.rawPayload === 'object' 
          ? Object.keys(input.metadata.rawPayload) 
          : 'not an object',
      })
      rawPayload = null
    }
  } else {
    console.error(`❌ [AUTO-MATCH] CRITICAL: No rawPayload in metadata for message ${input.providerMessageId}`, {
      hasMetadata: !!input.metadata,
      metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
      providerMessageId: input.providerMessageId,
      channel: input.channel,
    })
  }
  
  // Media extraction is now handled by canonical resolver above
  // No need for additional fallback extraction - resolver handles all cases
  
  // PHASE C: Always store media data in payload for recovery
  // This ensures the proxy can always recover media ID even if mediaUrl is null
  // Legacy compatibility: mediaUrl is same as providerMediaId (declared above)
  let payloadData: any = null
  if (mediaUrl || mediaMimeType || finalMessageType !== 'text') {
    // Determine media kind from type or mimeType (includes sticker)
    let mediaKind: 'image' | 'document' | 'audio' | 'video' | 'sticker' | null = null
    if (finalMessageType === 'audio' || mediaMimeType?.startsWith('audio/')) {
      mediaKind = 'audio'
    } else if (finalMessageType === 'image' || mediaMimeType?.startsWith('image/')) {
      mediaKind = 'image'
    } else if (finalMessageType === 'document' || mediaMimeType?.includes('pdf') || mediaMimeType?.includes('document')) {
      mediaKind = 'document'
    } else if (finalMessageType === 'video' || mediaMimeType?.startsWith('video/')) {
      mediaKind = 'video'
    } else if (finalMessageType === 'sticker' || mediaMimeType === 'image/webp') {
      mediaKind = 'sticker'
    }
    
    // PHASE C: Store structured media data in payload
    payloadData = {
      media: providerMediaId ? {
        id: providerMediaId, // Meta Graph API media ID (REQUIRED)
        kind: mediaKind || finalMessageType,
        mimeType: mediaMimeType || null,
        filename: mediaFilename || null,
        caption: mediaCaption || null, // Store caption for images/videos
      } : null,
      // Also store at top level for backward compatibility
      mediaUrl: providerMediaId || null, // Legacy: same as providerMediaId
      mimeType: mediaMimeType || null,
      caption: mediaCaption || null, // Store caption at top level too
    }
  }
  
  // CRITICAL: Log what we're storing
  console.log(`💾 [AUTO-MATCH] Storing message:`, {
    providerMessageId: input.providerMessageId,
    type: finalMessageType,
    mediaUrl: mediaUrl || 'NULL',
    mediaMimeType: mediaMimeType || 'NULL',
    hasRawPayload: !!rawPayload,
    hasPayload: !!payloadData,
    body: input.text?.substring(0, 50),
  })
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:1227',message:'DB_STORE_BEFORE',data:{providerMessageId:input.providerMessageId,type:finalMessageType,providerMediaId:providerMediaId||null,mediaUrl:mediaUrl||null,mediaMimeType:mediaMimeType||null,hasRawPayload:!!rawPayload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // CRITICAL: Final validation - if this is a media message, we MUST have providerMediaId or rawPayload with media object
  if (finalMessageType !== 'text' && !providerMediaId && rawPayload) {
    try {
      const raw = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
      
      // Check if rawPayload actually contains a media object (includes sticker)
      const hasMediaInRawPayload = !!(raw.audio || raw.image || raw.document || raw.video || raw.sticker)
      
      if (!hasMediaInRawPayload) {
        console.error(`❌ [AUTO-MATCH] CRITICAL: Media message ${input.providerMessageId} has rawPayload but NO media objects!`, {
          messageType: finalMessageType,
          rawPayloadKeys: Object.keys(raw),
          rawPayloadPreview: JSON.stringify(raw).substring(0, 500),
          hasProviderMediaId: !!providerMediaId,
        })
        // This is a data quality issue - log but continue
      } else {
        console.log(`✅ [AUTO-MATCH] rawPayload contains media objects for recovery`)
      }
    } catch (e) {
      // Ignore parse errors
      console.warn(`⚠️ [AUTO-MATCH] Failed to validate rawPayload: ${e}`)
    }
  }
  
  // CRITICAL: If we still don't have providerMediaId for a media message, log as ERROR
  if (finalMessageType !== 'text' && !providerMediaId) {
    console.error(`❌ [AUTO-MATCH] CRITICAL: Storing media message ${input.providerMessageId} with NULL providerMediaId!`, {
      messageType: finalMessageType,
      hasMediaUrl: !!mediaUrl,
      hasRawPayload: !!rawPayload,
      hasPayload: !!payloadData,
      rawPayloadPreview: rawPayload ? rawPayload.substring(0, 200) : null,
      metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
      metadataProviderMediaId: input.metadata?.providerMediaId || 'NULL',
      metadataMediaUrl: input.metadata?.mediaUrl || 'NULL',
    })
    // Still create message - proxy will try to recover
  } else if (finalMessageType !== 'text' && providerMediaId) {
    console.log(`✅ [AUTO-MATCH] Media message validated:`, {
      messageType: finalMessageType,
      providerMediaId,
      providerMediaIdLength: providerMediaId.length,
    })
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:1261',message:'DB_CREATE_START',data:{providerMessageId:input.providerMessageId,type:finalMessageType,providerMediaId:providerMediaId||null,mediaUrl:mediaUrl||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  // Use metadata.messageType if present, otherwise use resolved finalType
  const finalType = input.metadata?.messageType ?? finalMessageType

  // Handle rawPayload and payload conversion (string or object) - use metadata directly
  const finalRawPayload = input.metadata?.rawPayload
    ? (typeof input.metadata.rawPayload === 'string'
        ? input.metadata.rawPayload
        : JSON.stringify(input.metadata.rawPayload))
    : null
  
  const finalPayload = input.metadata?.payload
    ? (typeof input.metadata.payload === 'string'
        ? input.metadata.payload
        : JSON.stringify(input.metadata.payload))
    : null

  // Build message data - ONLY include media fields when they exist (never null/undefined)
  // This prevents Prisma from rejecting the create call due to unknown fields
  const data: any = {
    conversationId: input.conversationId,
    leadId: input.leadId,
    contactId: input.contactId, // CRITICAL: Link to contact
    direction: normalizedDirection, // Use normalized direction (INBOUND/OUTBOUND)
    channel: normalizedChannel, // Always lowercase for consistency
    type: input.metadata?.messageType ?? finalType, // Prefer metadata.messageType
    body: input.text ?? null, // CRITICAL FIX 3: Contains transcript if audio, or original text
    providerMessageId: input.providerMessageId,
    status: 'RECEIVED',
    createdAt: input.timestamp,
  }

  // ONLY ADD MEDIA FIELDS WHEN THEY EXIST (do not set null unless required)
  // Use existing variables declared above (providerMediaId, mediaMimeType, etc.)
  if (providerMediaId) {
    data.providerMediaId = providerMediaId
    data.mediaUrl = providerMediaId // legacy compatibility
  }
  
  if (mediaMimeType) {
    data.mediaMimeType = mediaMimeType
  }
  
  if (mediaFilename) {
    data.mediaFilename = mediaFilename
  }
  
  if (typeof mediaSize === "number") {
    data.mediaSize = mediaSize
  }
  
  if (mediaSha256) {
    data.mediaSha256 = mediaSha256
  }
  
  if (mediaCaption) {
    data.mediaCaption = mediaCaption
  }

  // ONLY ADD PAYLOAD FIELDS WHEN THEY EXIST
  if (finalRawPayload) {
    data.rawPayload = typeof finalRawPayload === "string" ? finalRawPayload : JSON.stringify(finalRawPayload)
  }
  
  if (finalPayload) {
    data.payload = typeof finalPayload === "string" ? finalPayload : JSON.stringify(finalPayload)
  }

  // Check for existing message first (idempotency - prevent duplicates from webhook retries)
  // NOTE: This check happens AFTER contact, conversation, and lead are already created/found
  // Fetch related entities from existing message to ensure we return complete result
  let existingMessage
  if (input.providerMessageId) {
    try {
      existingMessage = await prisma.message.findFirst({
        where: {
          channel: normalizedChannel,
          providerMessageId: input.providerMessageId,
        },
        include: {
          contact: true,
          conversation: true,
          lead: true,
        },
      })
      if (existingMessage) {
        console.log(`[AUTO-MATCH] Message already exists (idempotency): ${existingMessage.id} for providerMessageId ${input.providerMessageId}`)
        // Return full result with entities from existing message
        // Note: existingMessage.contact, existingMessage.conversation, existingMessage.lead should always be present due to include
        return {
          contact: existingMessage.contact,
          conversation: existingMessage.conversation,
          lead: existingMessage.lead,
          message: existingMessage,
          extractedFields: {},
          tasksCreated: 0,
          autoReplied: false,
          wasDuplicate: true,
        }
      }
    } catch (findError: any) {
      // If findFirst fails, continue to create (shouldn't happen, but handle gracefully)
      console.warn('[AUTO-MATCH] Error checking for existing message:', findError)
    }
  }

  // HOTFIX: Fallback retry for Prisma schema mismatch (temporary safety during Vercel deploys)
  // If Prisma Client doesn't recognize providerMediaId/media fields, retry without them
  let message
  const isInstagramMessage = normalizedChannel === 'instagram'
  
  if (isInstagramMessage) {
    console.log(`📸 [AUTO-MATCH-INSTAGRAM] Attempting to create message`, {
      conversationId: input.conversationId,
      leadId: input.leadId,
      contactId: input.contactId,
      channel: normalizedChannel,
      providerMessageId: input.providerMessageId,
      hasText: !!data.body,
      textPreview: data.body ? data.body.substring(0, 50) : 'N/A',
      direction: data.direction,
    })
  }
  
  try {
    message = await prisma.message.create({ data })
    
    if (isInstagramMessage) {
      console.log(`✅ [AUTO-MATCH-INSTAGRAM] Message created successfully`, {
        messageId: message.id,
        conversationId: message.conversationId,
        providerMessageId: input.providerMessageId,
      })
    }
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    
    // Handle unique constraint violation (duplicate message)
    if (err.code === 'P2002' || msg.includes('Unique constraint') || msg.includes('duplicate key') || msg.includes('already exists')) {
      console.log(`[AUTO-MATCH] Duplicate message detected (idempotency), fetching existing: channel=${normalizedChannel}, providerMessageId=${input.providerMessageId}`)
      // Message already exists, fetch it with related entities
      if (input.providerMessageId) {
        const duplicateMessage = await prisma.message.findFirst({
          where: {
            channel: normalizedChannel,
            providerMessageId: input.providerMessageId,
          },
          include: {
            contact: true,
            conversation: true,
            lead: true,
          },
        })
        if (duplicateMessage) {
          console.log(`[AUTO-MATCH] Found existing message: ${duplicateMessage.id}`)
          // Return full result with entities from existing message
          // Note: duplicateMessage.contact, duplicateMessage.conversation, duplicateMessage.lead should always be present due to include
          return {
            contact: duplicateMessage.contact,
            conversation: duplicateMessage.conversation,
            lead: duplicateMessage.lead,
            message: duplicateMessage,
            extractedFields: {},
            tasksCreated: 0,
            autoReplied: false,
            wasDuplicate: true,
          }
        }
      }
      // If we can't find it, log and throw error (shouldn't happen)
      console.error('[AUTO-MATCH] Unique constraint violation but couldn\'t find existing message')
      throw new Error('Duplicate message but existing message not found')
    }
    
    // If prod Prisma client is stale and rejects providerMediaId/media fields:
    if (msg.includes("Unknown argument `providerMediaId`") || msg.includes("Unknown argument providerMediaId")) {
      // Fallback: Strip all media-related fields and retry
      const {
        providerMediaId: _providerMediaId,
        mediaUrl: _mediaUrl,
        mediaMimeType: _mediaMimeType,
        mediaFilename: _mediaFilename,
        mediaSize: _mediaSize,
        mediaSha256: _mediaSha256,
        mediaCaption: _mediaCaption,
        rawPayload: _rawPayload,
        payload: _payload,
        ...fallback
      } = data

      console.warn('[AUTO-MATCH] Prisma schema mismatch detected, retrying without media fields', {
        providerMessageId: input.providerMessageId,
        type: input.metadata?.messageType ?? finalType,
      })
      
      // Still save the TEXT message row
      try {
        message = await prisma.message.create({ data: fallback })
      } catch (fallbackErr: any) {
        // Handle unique constraint in fallback too
        if (fallbackErr.code === 'P2002' || fallbackErr.message?.includes('Unique constraint') || fallbackErr.message?.includes('duplicate key')) {
          if (input.providerMessageId) {
            const fallbackDuplicateMessage = await prisma.message.findFirst({
              where: {
                channel: normalizedChannel,
                providerMessageId: input.providerMessageId,
              },
              include: {
                contact: true,
                conversation: true,
                lead: true,
              },
            })
            if (fallbackDuplicateMessage) {
              // Return full result with entities from existing message
              // Note: fallbackDuplicateMessage.contact, fallbackDuplicateMessage.conversation, fallbackDuplicateMessage.lead should always be present due to include
              return {
                contact: fallbackDuplicateMessage.contact,
                conversation: fallbackDuplicateMessage.conversation,
                lead: fallbackDuplicateMessage.lead,
                message: fallbackDuplicateMessage,
                extractedFields: {},
                tasksCreated: 0,
                autoReplied: false,
                wasDuplicate: true,
              }
            }
          }
        }
        throw fallbackErr
      }
    } else {
      throw err
    }
  }
  
  // TEMP DEBUG: Verification logging after save
  const verifyMessage = await prisma.message.findUnique({
    where: { id: message.id },
    select: {
      id: true,
      type: true,
      rawPayload: true,
      providerMediaId: true,
    },
  })
  console.error('🔍 [AUTO-MATCH-VERIFY] Message saved:', {
    id: verifyMessage?.id,
    type: verifyMessage?.type,
    hasRawPayload: !!verifyMessage?.rawPayload,
    providerMediaId: verifyMessage?.providerMediaId || null,
  })
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'autoMatchPipeline.ts:1279',message:'DB_CREATE_SUCCESS',data:{messageId:message.id,providerMessageId:input.providerMessageId,type:finalMessageType,storedProviderMediaId:message.providerMediaId||null,storedMediaUrl:message.mediaUrl||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Always create CommunicationLog entry (Phase 1 requirement)
  try {
    await prisma.communicationLog.create({
      data: {
        leadId: input.leadId,
        conversationId: input.conversationId,
        channel: normalizedChannel, // Use normalized channel
        direction: input.direction.toLowerCase(),
        messageSnippet: input.text.substring(0, 200),
        body: input.text,
        externalId: input.providerMessageId,
        whatsappMessageId: input.channel.toUpperCase() === 'WHATSAPP' ? input.providerMessageId : null,
        createdAt: input.timestamp,
      },
    })
    console.log(`✅ [AUTO-MATCH] Created CommunicationLog for message: ${message.id}`)
  } catch (logError: any) {
    // Non-blocking - log error but continue
    console.warn(`⚠️ [AUTO-MATCH] Failed to create CommunicationLog:`, logError.message)
  }

  console.log(`✅ [AUTO-MATCH] Created message: ${message.id}`)
  
  // PHASE C: Update diagnostic log with actual messageId
  if (providerMediaId || mediaMimeType) {
    console.log('[MEDIA]', JSON.stringify({
      messageId: message.id,
      providerMediaId: providerMediaId, // Meta Graph API media ID (REQUIRED)
      mediaType: finalMessageType,
      mediaMimeType: mediaMimeType,
      mediaFilename: mediaFilename,
      mediaSize: mediaSize,
      hasProviderMediaId: !!providerMediaId,
    }))
  }
  
  return message
}

/**
 * Step 6: Extract fields (deterministic)
 * STEP 4: Enhanced with services seed and business activity extraction
 */
async function extractFields(
  text: string,
  contact: any,
  lead: any
): Promise<AutoMatchResult['extractedFields'] & { businessActivityRaw?: string | null }> {
  // Use enhanced service detection with services seed
  const { detectServiceFromText, extractBusinessActivityRaw } = await import('./serviceDetection')
  const serviceDetection = await detectServiceFromText(text)
  
  // Use detected service or fallback to legacy extractService
  const rawService = serviceDetection.serviceTypeEnum || extractService(text)
  
  // Normalize the service to canonical list
  const { normalizeService } = await import('../services/normalizeService')
  const normalized = normalizeService(rawService || null)
  const service = normalized.service
  
  // STEP 4: Extract business activity (for business_setup services)
  // Store immediately without questioning
  let businessActivityRaw: string | null = null
  if (service === 'MAINLAND_BUSINESS_SETUP' || service === 'FREEZONE_BUSINESS_SETUP' || service?.includes('BUSINESS_SETUP')) {
    businessActivityRaw = await extractBusinessActivityRaw(text)
    if (businessActivityRaw) {
      console.log(`✅ [SERVICE-DETECT] Extracted businessActivityRaw IMMEDIATELY: ${businessActivityRaw}`)
    }
  }
  
  const nationality = extractNationality(text)
  const expiries = extractExpiry(text)
  const expiryHint = extractExpiryHint(text)
  const counts = extractCounts(text)
  const identity = extractIdentity(text)

  return {
    service,
    nationality,
    expiries,
    expiryHint,
    counts,
    identity,
    businessActivityRaw,
  }
}

