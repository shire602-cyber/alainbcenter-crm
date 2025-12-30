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
  
  // For other channels, use contact identifier
  if (contact.email) {
    return `${channelLower}:${contact.email.toLowerCase()}`
  }
  
  if (contact.phone) {
    const normalized = contact.phone.replace(/[^0-9+]/g, '')
    return `${channelLower}:${normalized.startsWith('+') ? normalized : `+${normalized}`}`
  }
  
  return null
}


