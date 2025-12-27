/**
 * Phone Number Normalization
 * Uses libphonenumber-js for robust E.164 normalization
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js'

/**
 * Normalize phone number to E.164 format
 * @param phone - Raw phone number (any format)
 * @param defaultCountry - Default country code if not detected (default: 'AE' for UAE)
 * @returns E.164 formatted phone number (e.g., +971501234567)
 * @throws Error if phone number cannot be normalized
 */
export function normalizePhone(phone: string, defaultCountry: CountryCode = 'AE'): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required and must be a string')
  }

  // Remove all non-digit characters except +
  const cleaned = phone.trim().replace(/[^\d+]/g, '')

  if (!cleaned) {
    throw new Error('Phone number is empty after cleaning')
  }

  try {
    // Try to parse with default country (UAE)
    const phoneNumber = parsePhoneNumber(cleaned, defaultCountry)
    
    if (!phoneNumber.isValid()) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    return phoneNumber.number // Returns E.164 format (e.g., +971501234567)
  } catch (error: any) {
    // Fallback: try without country code if it starts with +
    if (cleaned.startsWith('+')) {
      try {
        const phoneNumber = parsePhoneNumber(cleaned)
        if (phoneNumber.isValid()) {
          return phoneNumber.number
        }
      } catch {
        // Continue to error
      }
    }

    // Last resort: if it's a UAE number without +, add +971
    const digitsOnly = cleaned.replace(/[^\d]/g, '')
    if (digitsOnly.length >= 9 && digitsOnly.length <= 12) {
      // UAE numbers: 9 digits (0501234567) or 12 digits (971501234567)
      if (digitsOnly.startsWith('971')) {
        return '+' + digitsOnly
      } else if (digitsOnly.startsWith('0')) {
        // Remove leading 0 and add +971
        return '+971' + digitsOnly.substring(1)
      } else if (digitsOnly.length === 9) {
        // 9-digit UAE number
        return '+971' + digitsOnly
      }
    }

    throw new Error(`Failed to normalize phone number: ${phone}. Error: ${error.message}`)
  }
}

/**
 * Validate if a phone number is in E.164 format
 */
export function isValidE164(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false
  }

  // E.164 format: + followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/
  return e164Regex.test(phone)
}

/**
 * Extract WhatsApp user ID (wa_id) from webhook payload
 */
export function extractWaId(webhookPayload: any): string | null {
  if (!webhookPayload) return null

  // Meta webhook structure: entry[0].changes[0].value.contacts[0].wa_id
  const waId = webhookPayload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
               webhookPayload?.contacts?.[0]?.wa_id ||
               webhookPayload?.wa_id ||
               null

  return waId || null
}

