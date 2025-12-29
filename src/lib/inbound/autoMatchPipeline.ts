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

export interface AutoMatchInput {
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
  providerMessageId: string // Unique message ID from provider (for deduplication)
  fromPhone?: string | null
  fromEmail?: string | null
  fromName?: string | null
  text: string
  timestamp?: Date
  metadata?: Record<string, any>
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
  console.log(`🔄 [AUTO-MATCH] Starting pipeline`, {
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    hasText: !!input.text && input.text.trim().length > 0,
  })

  // Step 1: DEDUPE inbound message
  const isDuplicate = await checkInboundDedupe(input.channel, input.providerMessageId)
  if (isDuplicate) {
    console.log(`✅ [AUTO-MATCH] Duplicate message detected - skipping`)
    throw new Error('DUPLICATE_MESSAGE')
  }

  // Step 2: FIND/CREATE Contact (using new upsert logic with normalization)
  // Extract waId from webhook payload if available
  const webhookPayload = input.metadata?.webhookEntry || input.metadata?.webhookValue || input.metadata?.rawPayload || input.metadata
  const contactResult = await upsertContact(prisma, {
    phone: input.fromPhone || input.fromEmail || 'unknown',
    fullName: input.fromName || undefined,
    email: input.fromEmail || null,
    source: input.channel.toLowerCase(),
    webhookPayload: webhookPayload, // For extracting waId
  })
  
  // Fetch full contact record with all fields
  const contact = await prisma.contact.findUnique({
    where: { id: contactResult.id },
    select: { id: true, phone: true, phoneNormalized: true, waId: true, fullName: true, email: true, nationality: true },
  })
  
  if (!contact) {
    throw new Error(`Failed to fetch contact after upsert: ${contactResult.id}`)
  }

  // Step 3: FIND/CREATE Lead (smart rules) - MUST be before conversation to get leadId
  const lead = await findOrCreateLead({
    contactId: contactResult.id,
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp, // Use actual message timestamp
  })

  // Step 4: FIND/CREATE Conversation (linked to lead)
  // Extract externalThreadId using canonical function
  const externalThreadId = getExternalThreadId(
    input.channel,
    contact,
    input.metadata?.webhookEntry || input.metadata?.webhookValue || input.metadata
  )
  
  // DIAGNOSTIC LOG: before conversation upsert
  console.log(`[AUTO-MATCH] BEFORE-CONV-UPSERT`, JSON.stringify({
    contactId: contactResult.id,
    channel: input.channel,
    channelLower: input.channel.toLowerCase(),
    externalThreadId,
    leadId: lead.id,
    providerMessageId: input.providerMessageId,
  }))
  
  const conversationResult = await upsertConversation({
    contactId: contactResult.id,
    channel: input.channel,
    leadId: lead.id, // CRITICAL: Link conversation to lead
    timestamp: input.timestamp, // Use actual message timestamp
    externalThreadId, // Canonical external thread ID
  })
  
  // Fetch full conversation record
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationResult.id },
  })
  
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

  // Step 5: CREATE CommunicationLog
  const message = await createCommunicationLog({
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id, // CRITICAL: Include contactId
    channel: input.channel,
    direction: 'in',
    text: input.text,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp || new Date(),
  })

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
  const tasksCreated = await createAutoTasks({
    leadId: lead.id,
    conversationId: conversation.id,
    channel: input.channel,
    service: extractedFields.service,
    expiries: extractedFields.expiries,
    expiryHint: extractedFields.expiryHint,
    providerMessageId: input.providerMessageId,
  })

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
  try {
    await prisma.inboundMessageDedup.create({
      data: {
        provider: normalizeChannel(channel),
        providerMessageId,
        processingStatus: 'PROCESSING',
      },
    })
    return false // Not duplicate
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Unique constraint violation = duplicate
      return true
    }
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
  const conversation = await prisma.conversation.findUnique({
    where: { id },
  })
  
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
  // BUG FIX: Use actual message timestamp instead of webhook processing time
  const messageTimestamp = input.timestamp || new Date()
  // Check if this providerMessageId already linked to a lead (idempotency)
  const existingMessage = await prisma.message.findFirst({
    where: {
      providerMessageId: input.providerMessageId,
    },
    include: { lead: true },
  })

  if (existingMessage?.lead) {
    console.log(`✅ [AUTO-MATCH] Message already linked to lead: ${existingMessage.lead.id}`)
    return existingMessage.lead
  }

  // Find open lead (not Won/Lost/Cold) created within last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

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
    console.log(`✅ [AUTO-MATCH] Found open lead: ${openLead.id}`)
    // CRITICAL FIX: Link conversations to this lead if not already linked
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
    // Update lastInboundAt with actual message timestamp
    await prisma.lead.update({
      where: { id: openLead.id },
      data: { lastInboundAt: messageTimestamp },
    })
    return openLead
  }

  // Create new lead
  const newLead = await prisma.lead.create({
    data: {
      contactId: input.contactId,
      stage: 'NEW',
      status: 'new',
      pipelineStage: 'new',
      lastContactChannel: input.channel.toLowerCase(),
      lastInboundAt: messageTimestamp, // Use actual message timestamp
    },
  })
  
  // CRITICAL FIX: Link all existing conversations for this contact to the new lead
  await prisma.conversation.updateMany({
    where: {
      contactId: input.contactId,
      leadId: null, // Only update conversations not linked to a lead
    },
    data: {
      leadId: newLead.id,
    },
  })
  
  // Update contact source if not set
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      source: input.channel.toLowerCase(),
    },
  })

  console.log(`✅ [AUTO-MATCH] Created new lead: ${newLead.id} and linked existing conversations`)
  return newLead
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
}): Promise<any> {
  // CRITICAL FIX: Include contactId to ensure proper linking
  // PROBLEM FIX: Normalize direction to INBOUND/OUTBOUND (not IN/OUT)
  const normalizedDirection = input.direction.toUpperCase() === 'IN' ? 'INBOUND' : 
                               input.direction.toUpperCase() === 'OUT' ? 'OUTBOUND' :
                               input.direction.toUpperCase()
  
  // CRITICAL: Normalize channel to lowercase for consistency
  const normalizedChannel = normalizeChannel(input.channel)
  
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      leadId: input.leadId,
      contactId: input.contactId, // CRITICAL: Link to contact
      direction: normalizedDirection, // Use normalized direction (INBOUND/OUTBOUND)
      channel: normalizedChannel, // Always lowercase for consistency
      type: 'text',
      body: input.text,
      providerMessageId: input.providerMessageId,
      status: 'RECEIVED',
      createdAt: input.timestamp,
    },
  })

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
  const service = serviceDetection.serviceTypeEnum || extractService(text)
  
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

