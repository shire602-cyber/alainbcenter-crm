/**
 * Phone number normalization utilities
 * Converts phone numbers to E.164 format for WhatsApp Cloud API
 */

/**
 * Normalize phone number to E.164 format (+[country code][number])
 * E.164 format example: +971501234567
 * 
 * @param phone - Phone number in any format
 * @returns E.164 formatted phone number
 * @throws Error if phone cannot be normalized
 */
export function normalizeToE164(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required and must be a string')
  }

  let cleaned = phone.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  }

  cleaned = cleaned.replace(/^0+/, '')

  if (cleaned.startsWith('971')) {
    return '+' + cleaned
  }

  if (cleaned.length === 9 && cleaned.startsWith('5')) {
    return '+971' + cleaned
  }

  if (cleaned.length === 10 && cleaned.startsWith('05')) {
    return '+971' + cleaned.substring(1)
  }

  if (cleaned.length >= 10 && cleaned.length <= 15) {
    if (/^[1-9]/.test(cleaned)) {
      return '+' + cleaned
    }
  }

  if (cleaned.length >= 8 && cleaned.length <= 10) {
    return '+971' + cleaned
  }

  throw new Error(
    `Unable to normalize phone number "${phone}". ` +
    `Please provide number in E.164 format (e.g., +971501234567) or UAE format (e.g., 0501234567 or 501234567)`
  )
}

/**
 * Validate if a phone number looks like a valid E.164 format
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone)
}

