/**
 * Common Inbound Message Handler
 * 
 * Unified handler for processing inbound messages from any channel
 * (WhatsApp, Email, Instagram, Facebook, Webchat)
 * 
 * This ensures consistent Lead/Conversation/Message creation and automation triggering
 * across all channels.
 */

import { prisma } from './prisma'
import { normalizeInboundPhone, findContactByPhone } from './phone-inbound'
import { runInboundAutomationsForMessage } from './automation/inbound'

export type InboundChannel = 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'

export interface InboundMessageInput {
  channel: InboundChannel
  externalId?: string | null // Provider conversation/thread ID
  externalMessageId?: string | null // Provider message ID (for idempotency)
  fromAddress?: string | null // Email address, phone, or social handle
  fromName?: string | null
  body: string
  rawPayload?: unknown
  receivedAt?: Date
  mediaUrl?: string | null
  mediaMimeType?: string | null
}

/**
 * Handle an inbound message from any channel
 * 
 * This function:
 * 1. Normalizes the sender address per channel
 * 2. Finds or creates Contact
 * 3. Finds or creates Lead
 * 4. Finds or creates Conversation
 * 5. Creates Message record (with idempotency check)
 * 6. Triggers automation rules
 * 
 * Returns the created/updated Lead, Conversation, Message, and Contact
 */
export async function handleInboundMessage(
  input: InboundMessageInput
): Promise<{
  lead: any
  conversation: any
  message: any
  contact: any
}> {
  console.log(`📥 [INBOUND] handleInboundMessage called`, {
    channel: input.channel,
    fromAddress: input.fromAddress,
    hasBody: !!input.body && input.body.trim().length > 0,
    bodyLength: input.body?.length || 0,
    externalMessageId: input.externalMessageId,
  })

  const {
    channel,
    externalId,
    externalMessageId,
    fromAddress,
    fromName,
    body,
    rawPayload,
    receivedAt,
    mediaUrl,
    mediaMimeType,
  } = input

  const timestamp = receivedAt || new Date()
  const channelLower = channel.toLowerCase()

  // Step 1: Normalize fromAddress per channel
  let normalizedAddress: string | null = null
  let contactLookupField: 'phone' | 'email' | null = null

  if (channel === 'WHATSAPP') {
    if (fromAddress) {
      normalizedAddress = normalizeInboundPhone(fromAddress)
      contactLookupField = 'phone'
    }
  } else if (channel === 'EMAIL') {
    if (fromAddress) {
      normalizedAddress = fromAddress.toLowerCase().trim()
      contactLookupField = 'email'
    }
  } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
    // For social platforms, we'll store the handle/ID in a field
    // For now, try to find by phone/email if provided, otherwise use fromAddress as identifier
    normalizedAddress = fromAddress || null
    // We'll search by phone/email first, then by external ID in conversation
    contactLookupField = null // Will search by multiple fields
  } else if (channel === 'WEBCHAT') {
    // Webchat might provide email or session ID
    if (fromAddress?.includes('@')) {
      normalizedAddress = fromAddress.toLowerCase().trim()
      contactLookupField = 'email'
    } else {
      normalizedAddress = fromAddress || null
      contactLookupField = null
    }
  }

  // Step 2: Idempotency check - if externalMessageId provided, check for existing message
  if (externalMessageId) {
    const existingMessage = await prisma.message.findUnique({
      where: { providerMessageId: externalMessageId },
      include: {
        conversation: {
          include: {
            contact: true,
            lead: {
              select: {
                id: true,
                contactId: true,
                stage: true,
                pipelineStage: true,
                leadType: true,
                serviceTypeId: true,
                priority: true,
                aiScore: true,
                nextFollowUpAt: true,
                lastContactAt: true,
                expiryDate: true,
                autopilotEnabled: true,
                contact: {
                  select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    email: true,
                  },
                },
                // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
              },
            },
          },
        },
      },
    })

    if (existingMessage) {
      console.log(`⚠️ [DUPLICATE] Message ${externalMessageId} already exists (ID: ${existingMessage.id}) - NO auto-reply for duplicates`)
      if (!existingMessage.conversation.lead) {
        throw new Error('Message conversation has no associated lead')
      }
      
      // NO auto-reply for duplicates - user requirement: "duplicate messages from customer shouldn't get replies"
      // But log why we're skipping so we can debug
      console.log(`⏭️ [AUTO-REPLY] SKIPPED: Duplicate message detected via externalMessageId check (${externalMessageId})`)
      
      return {
        lead: existingMessage.conversation.lead,
        conversation: existingMessage.conversation,
        message: existingMessage,
        contact: existingMessage.conversation.lead.contact,
      }
    }
  }

  // Step 3: Find or create Contact
  let contact = null

  if (contactLookupField === 'phone' && normalizedAddress) {
    contact = await findContactByPhone(prisma, normalizedAddress)
  } else if (contactLookupField === 'email' && normalizedAddress) {
    contact = await prisma.contact.findFirst({
      where: { email: normalizedAddress },
    })
  } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
    // For social platforms, try to find by external ID in conversation
    if (externalId) {
      const existingConv = await prisma.conversation.findFirst({
        where: {
          channel: channelLower,
          externalId: externalId,
        },
        include: {
          contact: true,
        },
      })
      if (existingConv?.contact) {
        contact = existingConv.contact
      }
    }

    // Also try phone/email if fromAddress looks like one
    if (!contact && fromAddress) {
      if (fromAddress.includes('@')) {
        contact = await prisma.contact.findFirst({
          where: { email: fromAddress.toLowerCase() },
        })
      } else if (/^\+?[0-9]/.test(fromAddress)) {
        const normalizedPhone = normalizeInboundPhone(fromAddress)
        contact = await findContactByPhone(prisma, normalizedPhone)
      }
    }
  }

  // Create contact if not found
  if (!contact) {
    // Use phone number as display name if no name provided
    let displayName = fromName
    if (!displayName && contactLookupField === 'phone' && normalizedAddress) {
      displayName = normalizedAddress
    } else if (!displayName) {
      displayName = `Unknown ${channel} User`
    }
    
    const contactData: any = {
      fullName: displayName,
      source: channelLower,
    }

    if (contactLookupField === 'phone' && normalizedAddress) {
      contactData.phone = normalizedAddress
    } else if (contactLookupField === 'email' && normalizedAddress) {
      contactData.email = normalizedAddress
    } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
      // Store social handle in phone field temporarily (or add socialHandle field later)
      contactData.phone = fromAddress || `social_${Date.now()}`
      contactData.notes = `${channel} handle: ${fromAddress || 'unknown'}`
    } else if (channel === 'WEBCHAT') {
      if (normalizedAddress?.includes('@')) {
        contactData.email = normalizedAddress
      } else {
        contactData.phone = fromAddress || `webchat_${Date.now()}`
      }
    }

    contact = await prisma.contact.create({
      data: contactData,
    })
    console.log(`✅ Created new contact: ${contact.id} for ${channel} user`)
  }

  // Step 4: Find or create Lead
  // Use select to avoid loading missing columns (infoSharedAt, etc.)
  let lead = await prisma.lead.findFirst({
    where: {
      contactId: contact.id,
      OR: [
        { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
        { pipelineStage: { notIn: ['completed', 'lost'] } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      contactId: true,
      stage: true,
      pipelineStage: true,
      leadType: true,
      serviceTypeId: true,
      serviceTypeEnum: true,
      priority: true,
      urgency: true,
      aiScore: true,
      nextFollowUpAt: true,
      lastContactAt: true,
      expiryDate: true,
      autopilotEnabled: true,
      // @ts-ignore - autoReplyEnabled exists in schema but Prisma types may be out of sync
      autoReplyEnabled: true, // Default to enabled for new leads
      // @ts-ignore
      allowOutsideHours: true,
      // @ts-ignore
      mutedUntil: true,
      // @ts-ignore
      lastAutoReplyAt: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
    },
  })

  if (!lead) {
    // Create minimal lead
    lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        pipelineStage: 'new',
        status: 'new',
        notes: `Inbound ${channel} message`,
        lastContactAt: timestamp,
        lastContactChannel: channelLower,
        // @ts-ignore - autoReplyEnabled exists in schema but Prisma types may be out of sync
        autoReplyEnabled: true, // Enable auto-reply by default for new leads
        // source field not in Lead schema - removed
      },
    })
    console.log(`✅ Created new lead: ${lead.id} for contact ${contact.id}`)
  } else {
    // Update existing lead - ensure autoReplyEnabled is set if NULL
    // Check if autoReplyEnabled needs to be set (for leads created before migration)
    const needsAutoReplyEnabled = (lead as any).autoReplyEnabled === null || (lead as any).autoReplyEnabled === undefined
    
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: timestamp,
        lastContactChannel: channelLower,
        // Set autoReplyEnabled to true if it's NULL (for leads created before migration)
        ...(needsAutoReplyEnabled ? { autoReplyEnabled: true } : {}),
      },
    })
  }

  // Step 5: Find or create Conversation
  // CRITICAL FIX: Use unique constraint (contactId, channel) as primary lookup key
  // externalId is ONLY metadata, NOT used for lookup
  let conversation = await prisma.conversation.findUnique({
    where: {
      contactId_channel: {
      contactId: contact.id,
      channel: channelLower,
    },
    },
  })

  if (!conversation) {
    // Create new conversation using unique constraint
    try {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: channelLower,
          externalId: externalId || null, // Optional metadata only
        status: 'open',
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: 1,
      },
    })
      console.log(`✅ Created new conversation: ${conversation.id} for contact ${contact.id}, lead ${lead.id}, channel ${channelLower}`)
    } catch (createError: any) {
      // Handle race condition: if another request created it simultaneously, find it
      if (createError.code === 'P2002' && createError.meta?.target?.includes('contactId_channel')) {
        console.log(`⚠️ Race condition: conversation already exists, fetching...`)
        conversation = await prisma.conversation.findUnique({
          where: {
            contactId_channel: {
              contactId: contact.id,
              channel: channelLower,
            },
          },
        })
        if (!conversation) {
          throw new Error('Failed to create or find conversation after race condition')
        }
        console.log(`✅ Found conversation after race condition: ${conversation.id}`)
      } else {
        throw createError
      }
    }
  } else {
    // Update externalId if we have one and it's missing (for WhatsApp phone number ID tracking)
    // This is optional metadata, not used for lookup
    if (externalId && !conversation.externalId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { externalId },
      })
      console.log(`📝 Updated conversation ${conversation.id} with externalId: ${externalId}`)
    }
    // Ensure leadId is set (in case conversation was created before lead)
    if (conversation.leadId !== lead.id) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: lead.id },
      })
      console.log(`📝 Updated conversation ${conversation.id} with leadId: ${lead.id}`)
    }
    console.log(`📋 Found existing conversation: ${conversation.id} for contact ${contact.id}, lead ${lead.id}, channel ${channelLower}`)
  }

  // Step 6: Create Message record (with idempotency check via providerMessageId)
  // Determine message type based on media
  let messageType = 'text'
  if (mediaUrl && mediaMimeType) {
    if (mediaMimeType.startsWith('image/')) {
      messageType = 'image'
    } else if (mediaMimeType.startsWith('video/')) {
      messageType = 'video'
    } else if (mediaMimeType.startsWith('audio/')) {
      messageType = 'audio'
    } else if (mediaMimeType.startsWith('application/') || mediaMimeType.includes('pdf') || mediaMimeType.includes('document')) {
      messageType = 'document'
    }
  }
  
  let message
  let isDuplicate = false
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'INBOUND', // Message schema uses uppercase: INBOUND | OUTBOUND
        channel: channelLower,
        type: messageType,
        body: body || null,
        mediaUrl: mediaUrl || null,
        mediaMimeType: mediaMimeType || null,
        providerMessageId: externalMessageId || null,
        status: 'RECEIVED',
        payload: rawPayload ? JSON.stringify(rawPayload) : null,
        rawPayload: rawPayload ? JSON.stringify(rawPayload) : null,
        createdAt: timestamp,
      },
    })
    console.log(`✅ Created inbound message ${message.id} for conversation ${conversation.id}`)
  } catch (error: any) {
    // Handle duplicate message (idempotency)
    if (error.code === 'P2002' && externalMessageId && error.meta?.target?.includes('providerMessageId')) {
      console.log(`⚠️ Duplicate message detected (providerMessageId: ${externalMessageId}), fetching existing`)
      isDuplicate = true
      message = await prisma.message.findUnique({
        where: { providerMessageId: externalMessageId },
      })
      if (!message) {
        throw new Error('Duplicate message detected but could not fetch existing message')
      }
      console.log(`✅ Using existing message ${message.id}`)
      
      // Even for duplicates, update conversation timestamps if this message is newer
      // This handles cases where webhook retries with same message ID
      if (message.createdAt < timestamp) {
        console.log(`📝 Updating conversation timestamps for duplicate message (newer timestamp)`)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: timestamp,
            lastInboundAt: timestamp,
            // Don't increment unreadCount for duplicates
          },
        })
      }
    } else {
      console.error(`❌ Failed to create message:`, {
        error: error.message,
        code: error.code,
        externalMessageId,
        conversationId: conversation.id,
      })
      throw error
    }
  }
  
  // Only update conversation if this is NOT a duplicate (duplicates handled above)
  if (!isDuplicate) {
    // Conversation was already updated in Step 5, but ensure it's current
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: {
          increment: 1,
        },
      },
    })
    console.log(`✅ Updated conversation ${conversation.id} timestamps and unreadCount`)
  }

  // Create initial status event
  try {
    await prisma.messageStatusEvent.create({
      data: {
        messageId: message.id,
        conversationId: conversation.id,
        status: 'RECEIVED',
        providerStatus: 'received',
        rawPayload: rawPayload ? JSON.stringify(rawPayload) : null,
        receivedAt: timestamp,
      },
    })
  } catch (e) {
    console.warn('Failed to create MessageStatusEvent:', e)
  }

  // Step 7: Create CommunicationLog (legacy, for backward compatibility)
  try {
    await prisma.communicationLog.create({
      data: {
        leadId: lead.id,
        conversationId: conversation.id,
        channel: channelLower,
        direction: 'inbound', // CommunicationLog schema uses lowercase: 'inbound' | 'outbound'
        from: fromAddress || null,
        body: body,
        messageSnippet: body?.substring(0, 200) || 'Inbound message',
        externalId: externalMessageId || null,
        meta: rawPayload ? JSON.stringify(rawPayload) : null,
        isRead: false,
      },
    })
  } catch (e) {
    // CommunicationLog might have unique constraints - that's OK
    console.warn('Failed to create CommunicationLog:', e)
  }

  // Step 8: AI Data Extraction (Phase 1) - Extract structured data from message
  if (body && body.trim().length > 0) {
    try {
      const { extractLeadDataFromMessage } = await import('./ai/extractData')
      const extracted = await extractLeadDataFromMessage(
        body,
        contact,
        lead
      )

      // CRITICAL FIX: Always update name and nationality when provided, even with lower confidence
      // User requirement: "when a customer gives their name and nationality lead should be updated automatically"
      const updates: any = {}
      const contactUpdates: any = {}

      // Simple regex fallback for name (e.g., "My name is Herbert", "I am Herbert", "name: Herbert")
      let extractedName = extracted.name
      if (!extractedName || extractedName.trim().length === 0) {
        const namePatterns = [
          /(?:my\s+name\s+is|i\s+am|name\s*:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          /(?:i'm|i'm\s+called|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        ]
        for (const pattern of namePatterns) {
          const match = body.match(pattern)
          if (match && match[1] && match[1].trim().length > 1) {
            extractedName = match[1].trim()
            console.log(`📝 Regex extracted name: "${extractedName}"`)
            break
          }
        }
      }

      // Update name if extracted (lower threshold for name - it's usually clear)
      if (extractedName && extractedName.trim().length > 0) {
        // Always update if current name is missing, unknown, or extracted name is different
        if (!contact.fullName || 
            contact.fullName.includes('Unknown') || 
            contact.fullName.includes('WhatsApp') ||
            contact.fullName.toLowerCase() !== extractedName.toLowerCase()) {
          contactUpdates.fullName = extractedName.trim()
          console.log(`📝 Updating contact name: "${contact.fullName || 'none'}" → "${extractedName}"`)
        }
      }
      
      // Simple regex fallback for nationality (e.g., "I am german", "I'm german", "nationality: german")
      let extractedNationality = extracted.nationality
      if (!extractedNationality || extractedNationality.trim().length === 0) {
        const nationalityPatterns = [
          /(?:i\s+am|i'm)\s+(german|british|american|indian|pakistani|filipino|egyptian|lebanese|jordanian|syrian|iraqi|iranian|turkish|russian|chinese|japanese|korean|thai|vietnamese|indonesian|malaysian|singaporean|australian|canadian|french|spanish|italian|greek|dutch|belgian|swiss|austrian|swedish|norwegian|danish|finnish|polish|czech|romanian|bulgarian|hungarian|portuguese|brazilian|mexican|argentinian|south\s+african|nigerian|kenyan|ethiopian|ugandan|tanzanian|ghanaian|moroccan|algerian|tunisian|libyan|sudanese|somali|eritrean|yemeni|omani|bahraini|kuwaiti|qatari|saudi|emirati|afghan|bangladeshi|sri\s+lankan|nepalese|myanmar| cambodian|laotian|mongolian|uzbek|kazakh|azerbaijani|armenian|georgian|ukrainian|belarusian|moldovan|serbian|croatian|bosnian|albanian|macedonian|montenegrin|slovenian|slovak|estonian|latvian|lithuanian|icelandic|maltese|cypriot|luxembourgish|monégasque|andorran|liechtenstein|san\s+marino|vatican|maltese)/i,
          /(?:nationality|from)\s*:?\s*(german|british|american|indian|pakistani|filipino|egyptian|lebanese|jordanian|syrian|iraqi|iranian|turkish|russian|chinese|japanese|korean|thai|vietnamese|indonesian|malaysian|singaporean|australian|canadian|french|spanish|italian|greek|dutch|belgian|swiss|austrian|swedish|norwegian|danish|finnish|polish|czech|romanian|bulgarian|hungarian|portuguese|brazilian|mexican|argentinian|south\s+african|nigerian|kenyan|ethiopian|ugandan|tanzanian|ghanaian|moroccan|algerian|tunisian|libyan|sudanese|somali|eritrean|yemeni|omani|bahraini|kuwaiti|qatari|saudi|emirati|afghan|bangladeshi|sri\s+lankan|nepalese|myanmar|cambodian|laotian|mongolian|uzbek|kazakh|azerbaijani|armenian|georgian|ukrainian|belarusian|moldovan|serbian|croatian|bosnian|albanian|macedonian|montenegrin|slovenian|slovak|estonian|latvian|lithuanian|icelandic|maltese|cypriot|luxembourgish|monégasque|andorran|liechtenstein|san\s+marino|vatican|maltese)/i,
        ]
        for (const pattern of nationalityPatterns) {
          const match = body.match(pattern)
          if (match && match[1] && match[1].trim().length > 1) {
            extractedNationality = match[1].trim()
            console.log(`📝 Regex extracted nationality: "${extractedNationality}"`)
            break
          }
        }
      }

      // Update nationality if extracted (lower threshold - it's usually clear)
      if (extractedNationality && extractedNationality.trim().length > 0) {
        // Always update if current nationality is missing or extracted nationality is different
        if (!contact.nationality || 
            contact.nationality.toLowerCase() !== extractedNationality.toLowerCase()) {
          contactUpdates.nationality = extractedNationality.trim()
          console.log(`📝 Updating contact nationality: "${contact.nationality || 'none'}" → "${extractedNationality}"`)
        }
      }
      
      // Update email/phone only with reasonable confidence (>50)
      if (extracted.confidence > 50) {
        if (extracted.email && !contact.email) {
          contactUpdates.email = extracted.email
        }
        if (extracted.phone && !contact.phone) {
          contactUpdates.phone = extracted.phone
        }
      }
      
      // Update lead fields only with reasonable confidence (>50)
      if (extracted.confidence > 50) {

        // Update lead if we have better info
        if (extracted.serviceType && !lead.leadType && !lead.serviceTypeId) {
          // Try to find matching ServiceType
          // Note: Schema uses PostgreSQL, but code uses Prisma's contains which works across databases
          const serviceType = await prisma.serviceType.findFirst({
            where: {
              OR: [
                { name: { contains: extracted.serviceType } },
                { code: extracted.serviceTypeEnum || undefined },
              ],
            },
          })
          if (serviceType) {
            updates.serviceTypeId = serviceType.id
            updates.leadType = serviceType.name
          } else {
            updates.leadType = extracted.serviceType
          }
        }
        if (extracted.serviceTypeEnum && !lead.serviceTypeEnum) {
          updates.serviceTypeEnum = extracted.serviceTypeEnum
        }
        if (extracted.urgency && !lead.urgency) {
          updates.urgency = extracted.urgency.toUpperCase()
        }
        if (extracted.expiryDate) {
          try {
            const parsedDate = new Date(extracted.expiryDate)
            if (!isNaN(parsedDate.getTime()) && !lead.expiryDate) {
              updates.expiryDate = parsedDate
            }
          } catch {
            // Ignore invalid dates
          }
        }
        if (extracted.notes && (!lead.notes || lead.notes.length < extracted.notes.length)) {
          updates.notes = lead.notes 
            ? `${lead.notes}\n\n[AI Extracted]: ${extracted.notes}`
            : extracted.notes
        }
      } // End of confidence > 50 check for lead fields

      // Apply contact updates (name/nationality always, email/phone only if confidence > 50)
      if (Object.keys(contactUpdates).length > 0) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: contactUpdates,
        })
        console.log(`✅ Updated contact ${contact.id} with AI-extracted data:`, contactUpdates)
      }

      // Apply lead updates (only if confidence > 50)
      if (Object.keys(updates).length > 0) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: updates,
        })
        console.log(`✅ Updated lead ${lead.id} with AI-extracted data`)
      }
    } catch (extractError: any) {
      // Don't fail the whole process if extraction fails
      console.warn('AI data extraction failed (non-blocking):', extractError.message)
    }
  }

  // BUG FIX #2: Removed duplicate AI reply call from inbound.ts
  // The webhook handler (route.ts) is now the SINGLE source of truth for triggering AI replies
  // This prevents duplicate replies because:
  // 1. Webhook handler has access to providerMessageId for idempotency logging
  // 2. Webhook handler can properly log to OutboundMessageLog with triggerProviderMessageId
  // 3. Inbound handler doesn't have providerMessageId, so it can't log properly
  // 
  // The webhook handler will call handleInboundAutoReply with triggerProviderMessageId,
  // which enables proper outbound idempotency checking and logging.
  //
  // Log that we're skipping AI reply here (webhook will handle it)
  if (!isDuplicate && message && message.body && message.body.trim().length > 0 && lead && lead.id && contact && contact.id) {
    console.log(`⏭️ [AI-REPLY] Skipping AI reply in inbound.ts - webhook handler will trigger it with proper idempotency`)
  } else if (isDuplicate) {
    console.log(`⏭️ [AI-REPLY] SKIPPED: Duplicate message detected - no AI reply for duplicates`)
  } else {
    console.log(`⏭️ [AI-REPLY] SKIPPED: Missing required data`, {
      hasMessage: !!message,
      hasBody: !!message?.body,
      hasLead: !!lead,
      hasContact: !!contact,
      bodyLength: message?.body?.length || 0,
      isDuplicate,
    })
  }

  console.log(
    `✅ Processed inbound ${channel} message ${externalMessageId || message.id} from ${fromAddress || 'unknown'}`
  )

  // Reload lead with contact for return
  // Use select to avoid loading missing columns
  const leadWithContact = await prisma.lead.findUnique({
    where: { id: lead.id },
    select: {
      id: true,
      contactId: true,
      stage: true,
      pipelineStage: true,
      leadType: true,
      serviceTypeId: true,
      serviceTypeEnum: true,
      priority: true,
      urgency: true,
      aiScore: true,
      nextFollowUpAt: true,
      lastContactAt: true,
      expiryDate: true,
      autopilotEnabled: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
        },
      },
      // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
    },
  })

  return {
    lead: leadWithContact || lead,
    conversation,
    message,
    contact,
  }
}











