/**
 * SERVICE NORMALIZATION
 * 
 * Enforces canonical service list and normalizes user/AI input to standard services.
 * Unknown services are stored as "OTHER" with original text in serviceOtherDescription.
 */

import { matchServiceWithSynonyms } from '../inbound/serviceSynonyms'

/**
 * Canonical service list - these are the ONLY allowed service values
 * Must match serviceTypeEnum values in the database
 */
export const CANONICAL_SERVICES = [
  'FAMILY_VISA',
  'GOLDEN_VISA',
  'FREELANCE_VISA',
  'EMPLOYMENT_VISA',
  'VISIT_VISA',
  'MAINLAND_BUSINESS_SETUP',
  'FREEZONE_BUSINESS_SETUP',
  'PRO_SERVICES',
  'VISA_RENEWAL',
  'EMIRATES_ID',
  'INVESTOR_PARTNER_VISA',
  'DOMESTIC_WORKER_VISA',
  'MEDICAL_BIOMETRICS',
  'VISA_CANCELLATION',
  'STATUS_CHANGE_INSIDE_UAE',
  'OFFSHORE_COMPANY',
  'BRANCH_SUBSIDIARY_SETUP',
  'BANK_ACCOUNT_ASSISTANCE',
  'ACCOUNTING_VAT_SERVICES',
  'OTHER', // Special value for unknown services
] as const

export type CanonicalService = typeof CANONICAL_SERVICES[number]

/**
 * Service display names for UI
 */
export const SERVICE_DISPLAY_NAMES: Record<CanonicalService, string> = {
  FAMILY_VISA: 'Family Visa',
  GOLDEN_VISA: 'Golden Visa',
  FREELANCE_VISA: 'Freelance Visa',
  EMPLOYMENT_VISA: 'Employment Visa',
  VISIT_VISA: 'Visit Visa',
  MAINLAND_BUSINESS_SETUP: 'Mainland Business Setup',
  FREEZONE_BUSINESS_SETUP: 'Freezone Business Setup',
  PRO_SERVICES: 'PRO Services',
  VISA_RENEWAL: 'Visa Renewal',
  EMIRATES_ID: 'Emirates ID',
  INVESTOR_PARTNER_VISA: 'Investor/Partner Visa',
  DOMESTIC_WORKER_VISA: 'Domestic Worker Visa',
  MEDICAL_BIOMETRICS: 'Medical/Biometrics',
  VISA_CANCELLATION: 'Visa Cancellation',
  STATUS_CHANGE_INSIDE_UAE: 'Status Change (Inside UAE)',
  OFFSHORE_COMPANY: 'Offshore Company',
  BRANCH_SUBSIDIARY_SETUP: 'Branch/Subsidiary Setup',
  BANK_ACCOUNT_ASSISTANCE: 'Bank Account Assistance',
  ACCOUNTING_VAT_SERVICES: 'Accounting/VAT Services',
  OTHER: 'Other',
}

/**
 * Normalize service input to canonical service
 * 
 * @param input - User input or AI-extracted service text
 * @returns Normalized service result with canonical service and optional description
 */
export function normalizeService(input: string | null | undefined): {
  service: CanonicalService
  serviceOtherDescription: string | null
} {
  // Handle empty/null input
  if (!input || input.trim().length === 0) {
    return {
      service: 'OTHER',
      serviceOtherDescription: null,
    }
  }

  const trimmedInput = input.trim()

  // Check if input is already a canonical service (case-insensitive)
  const upperInput = trimmedInput.toUpperCase().replace(/[^A-Z_]/g, '_')
  const exactMatch = CANONICAL_SERVICES.find(
    (s) => s === upperInput || s === trimmedInput.toUpperCase()
  )
  
  if (exactMatch) {
    return {
      service: exactMatch,
      serviceOtherDescription: null,
    }
  }

  // Try synonym matching (handles variations, misspellings, etc.)
  const synonymMatch = matchServiceWithSynonyms(trimmedInput)
  
  if (synonymMatch && CANONICAL_SERVICES.includes(synonymMatch as CanonicalService)) {
    return {
      service: synonymMatch as CanonicalService,
      serviceOtherDescription: null,
    }
  }

  // No match found - store as OTHER with original text
  return {
    service: 'OTHER',
    serviceOtherDescription: trimmedInput,
  }
}

/**
 * Check if a service value is valid (canonical)
 */
export function isValidService(service: string | null | undefined): boolean {
  if (!service) return false
  return CANONICAL_SERVICES.includes(service as CanonicalService)
}

/**
 * Get service display name
 */
export function getServiceDisplayName(service: CanonicalService | string | null | undefined): string {
  if (!service) return 'Not specified'
  if (service === 'OTHER') return 'Other'
  return SERVICE_DISPLAY_NAMES[service as CanonicalService] || service.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

