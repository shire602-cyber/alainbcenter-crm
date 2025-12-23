/**
 * Message utility functions
 * Helper functions for generating proper greetings and names in messages
 */

/**
 * Get a proper greeting name for a contact
 * Never uses "Unknown WHATSAPP User" - uses "Dear" or "Hello there" instead
 */
export function getGreetingName(contact: { fullName?: string | null; phone?: string | null } | null | undefined): string {
  if (!contact) {
    return 'Dear'
  }

  const fullName = contact.fullName?.trim()
  
  // Check if name contains "Unknown" or is just a phone number
  if (!fullName || 
      fullName.toLowerCase().includes('unknown') || 
      fullName.toLowerCase().includes('whatsapp user') ||
      fullName.match(/^\+?[0-9\s-]+$/) || // Just phone number
      fullName.length < 2) {
    return 'Dear'
  }

  // Extract first name (first word)
  const firstName = fullName.split(' ')[0].trim()
  
  // If first name is still "Unknown" or too short, use "Dear"
  if (firstName.toLowerCase().includes('unknown') || firstName.length < 2) {
    return 'Dear'
  }

  return firstName
}

/**
 * Get a proper greeting for messages
 * Returns "Hi [Name]" or "Hello there" if name is not available
 */
export function getGreeting(contact: { fullName?: string | null; phone?: string | null } | null | undefined, style: 'formal' | 'casual' = 'casual'): string {
  const name = getGreetingName(contact)
  
  if (name === 'Dear') {
    return style === 'formal' ? 'Dear' : 'Hello there'
  }
  
  return style === 'formal' ? `Dear ${name}` : `Hi ${name}`
}

/**
 * Check if a name should be considered "unknown" or invalid
 */
export function isUnknownName(name: string | null | undefined): boolean {
  if (!name) return true
  
  const normalized = name.trim().toLowerCase()
  return (
    normalized.includes('unknown') ||
    normalized.includes('whatsapp user') ||
    normalized.match(/^\+?[0-9\s-]+$/) !== null || // Just phone number
    normalized.length < 2
  )
}

