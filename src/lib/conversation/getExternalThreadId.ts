/**
 * Get external thread ID for conversation identity
 * 
 * This is the SINGLE SOURCE OF TRUTH for external thread ID extraction.
 * Used by both inbound and outbound to ensure same conversation.
 */

/**
 * Get external thread ID for WhatsApp
 * Prefers provider thread ID if available, else falls back to normalized phone
 */
export function getWhatsAppExternalThreadId(
  contact: { waId?: string | null; phone?: string | null },
  webhookPayload?: any
): string | null {
  // Prefer waId from contact
  if (contact.waId) {
    return contact.waId
  }
  
  // Try to extract from webhook payload
  if (webhookPayload) {
    const waId = 
      webhookPayload.contacts?.[0]?.wa_id ||
      webhookPayload.value?.contacts?.[0]?.wa_id ||
      webhookPayload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id
    
    if (waId) {
      return waId
    }
  }
  
  // Fallback to normalized phone
  if (contact.phone) {
    // Normalize phone to E.164 format
    const normalized = contact.phone.replace(/[^0-9+]/g, '')
    return normalized.startsWith('+') ? normalized : `+${normalized}`
  }
  
  return null
}

/**
 * Get external thread ID for email
 */
export function getEmailExternalThreadId(
  contact: { email?: string | null },
  threadId?: string
): string | null {
  if (threadId) {
    return `email:${threadId}`
  }
  
  if (contact.email) {
    return `email:${contact.email.toLowerCase()}`
  }
  
  return null
}

/**
 * Get external thread ID for generic channel
 */
export function getExternalThreadId(
  channel: string,
  contact: { waId?: string | null; phone?: string | null; email?: string | null },
  webhookPayload?: any,
  threadId?: string
): string | null {
  const channelLower = channel.toLowerCase()
  
  if (channelLower === 'whatsapp') {
    return getWhatsAppExternalThreadId(contact, webhookPayload)
  }
  
  if (channelLower === 'email') {
    return getEmailExternalThreadId(contact, threadId)
  }
  
  // For Instagram, use Instagram user ID from phone field (format: ig:123456789)
  if (channelLower === 'instagram') {
    // Primary: Extract from contact phone field (most reliable)
    if (contact.phone && contact.phone.startsWith('ig:')) {
      const instagramUserId = contact.phone.replace('ig:', '')
      const threadId = `instagram:${instagramUserId}`
      console.log(`✅ [EXTERNAL-THREAD-ID] Instagram thread ID from contact phone: ${threadId}`)
      return threadId
    }
    // Fallback 1: Extract from metadata.senderId (from autoMatchPipeline)
    if (webhookPayload?.metadata?.senderId) {
      const threadId = `instagram:${webhookPayload.metadata.senderId}`
      console.log(`✅ [EXTERNAL-THREAD-ID] Instagram thread ID from metadata.senderId: ${threadId}`)
      return threadId
    }
    // Fallback 2: Check directly in metadata object (not nested)
    if (webhookPayload?.senderId) {
      const threadId = `instagram:${webhookPayload.senderId}`
      console.log(`✅ [EXTERNAL-THREAD-ID] Instagram thread ID from webhookPayload.senderId: ${threadId}`)
      return threadId
    }
    // Fallback 3: Check in top-level metadata object
    if (typeof webhookPayload === 'object' && 'senderId' in webhookPayload) {
      const threadId = `instagram:${(webhookPayload as any).senderId}`
      console.log(`✅ [EXTERNAL-THREAD-ID] Instagram thread ID from top-level senderId: ${threadId}`)
      return threadId
    }
    // Log warning if no Instagram user ID found
    console.warn(`⚠️ [EXTERNAL-THREAD-ID] Could not extract Instagram user ID`, {
      contactPhone: contact.phone || 'N/A',
      hasWebhookPayload: !!webhookPayload,
      webhookPayloadKeys: webhookPayload ? Object.keys(webhookPayload) : [],
    })
  }
  
  // For Facebook, use Facebook user ID from phone field (format: fb:123456789)
  if (channelLower === 'facebook') {
    if (contact.phone && contact.phone.startsWith('fb:')) {
      const facebookUserId = contact.phone.replace('fb:', '')
      return `facebook:${facebookUserId}`
    }
  }
  
  // For other channels, use contact identifier
  if (contact.email) {
    return `${channelLower}:${contact.email.toLowerCase()}`
  }
  
  if (contact.phone) {
    // Skip phone normalization for Instagram/Facebook (they use prefixes)
    if (contact.phone.startsWith('ig:') || contact.phone.startsWith('fb:')) {
      return `${channelLower}:${contact.phone}`
    }
    const normalized = contact.phone.replace(/[^0-9+]/g, '')
    return `${channelLower}:${normalized.startsWith('+') ? normalized : `+${normalized}`}`
  }
  
  return null
}


