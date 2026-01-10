/**
 * Lead Cockpit Constants
 * Unified constants for pipeline stages, document types, expiry types, etc.
 */

// Pipeline stages (Odoo-style)
export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT', // Quote Sent
  'ENGAGED', // Negotiation
  'COMPLETED_WON', // Won
  'LOST',
  'ON_HOLD', // Cold
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_SENT: 'Quote Sent',
  ENGAGED: 'Negotiation',
  COMPLETED_WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'Cold',
}

export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  NEW: 'bg-gray-100 text-gray-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-yellow-100 text-yellow-800',
  PROPOSAL_SENT: 'bg-orange-100 text-orange-800',
  ENGAGED: 'bg-purple-100 text-purple-800',
  COMPLETED_WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
  ON_HOLD: 'bg-gray-100 text-gray-800',
}

// Document types
export const DOCUMENT_TYPES = [
  'PASSPORT',
  'EID',
  'VISA',
  'PHOTO',
  'INSURANCE',
  'TRADE_LICENSE',
  'ESTABLISHMENT_CARD',
  'TENANCY_CONTRACT',
  'OTHER',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PASSPORT: 'Passport',
  EID: 'Emirates ID',
  VISA: 'Visa',
  PHOTO: 'Photo',
  INSURANCE: 'Insurance',
  TRADE_LICENSE: 'Trade License',
  ESTABLISHMENT_CARD: 'Establishment Card',
  TENANCY_CONTRACT: 'Tenancy Contract',
  OTHER: 'Other',
}

export const DOCUMENT_STATUSES = ['MISSING', 'RECEIVED', 'APPROVED', 'REJECTED'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

// Expiry types
export const EXPIRY_TYPES = [
  'VISA_EXPIRY',
  'EMIRATES_ID_EXPIRY',
  'PASSPORT_EXPIRY',
  'TRADE_LICENSE_EXPIRY',
  'ESTABLISHMENT_CARD_EXPIRY',
  'INSURANCE_EXPIRY',
] as const

export type ExpiryType = (typeof EXPIRY_TYPES)[number]

export const EXPIRY_TYPE_LABELS: Record<ExpiryType, string> = {
  VISA_EXPIRY: 'Visa',
  EMIRATES_ID_EXPIRY: 'Emirates ID',
  PASSPORT_EXPIRY: 'Passport',
  TRADE_LICENSE_EXPIRY: 'Trade License',
  ESTABLISHMENT_CARD_EXPIRY: 'Establishment Card',
  INSURANCE_EXPIRY: 'Insurance',
}

// Task types
export const TASK_TYPES = [
  'FOLLOW_UP',
  'DOC_CHASE',
  'QUOTE',
  'RENEWAL',
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'OTHER',
] as const

export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  FOLLOW_UP: 'Follow-up',
  DOC_CHASE: 'Document Chase',
  QUOTE: 'Quote',
  RENEWAL: 'Renewal',
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  OTHER: 'Other',
}

// Service types (simplified for UI)
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  MAINLAND_BUSINESS_SETUP: 'Business Setup (Mainland)',
  FREEZONE_BUSINESS_SETUP: 'Business Setup (Freezone)',
  FAMILY_VISA: 'Family Visa',
  FREELANCE_VISA: 'Freelance Visa',
  GOLDEN_VISA: 'Golden Visa',
  EMPLOYMENT_VISA: 'Employment Visa',
  INVESTOR_PARTNER_VISA: 'Investor Visa',
  VISA_RENEWAL: 'Visa Renewal',
  // Add more as needed
}

// Source labels
export const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  website: 'Website',
  instagram: 'Instagram',
  facebook: 'Facebook',
  email: 'Email',
  manual: 'Manual',
}

