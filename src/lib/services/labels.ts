/**
 * SERVICE LABEL MAP
 * 
 * Deterministic fallback labels for serviceTypeEnum values
 * Used when serviceTypeId is null (no DB mapping exists)
 */

const SERVICE_LABEL_MAP: Record<string, string> = {
  // Business Setup
  'MAINLAND_BUSINESS_SETUP': 'Mainland Business Setup',
  'FREEZONE_BUSINESS_SETUP': 'Freezone Business Setup',
  'BUSINESS_SETUP': 'Business Setup',
  
  // Visas
  'FREELANCE_VISA': 'Freelance Visa',
  'FAMILY_VISA': 'Family Visa',
  'EMPLOYMENT_VISA': 'Employment Visa',
  'INVESTOR_VISA': 'Investor Visa',
  'GOLDEN_VISA': 'Golden Visa',
  'VISIT_VISA': 'Visit Visa',
  'TOURIST_VISA': 'Tourist Visa',
  
  // Renewals
  'VISA_RENEWAL': 'Visa Renewal',
  'LICENSE_RENEWAL': 'License Renewal',
  'PERMIT_RENEWAL': 'Permit Renewal',
  
  // Other
  'PROFESSIONAL_LICENSE': 'Professional License',
  'TRADING_LICENSE': 'Trading License',
  'ACCOUNTING_SERVICES': 'Accounting Services',
  'LEGAL_SERVICES': 'Legal Services',
}

/**
 * Get human-readable label for serviceTypeEnum
 * Falls back to formatted enum value if not in map
 */
export function getServiceLabel(serviceTypeEnum: string | null | undefined): string {
  if (!serviceTypeEnum) {
    return 'Not specified'
  }

  // Check map first
  if (SERVICE_LABEL_MAP[serviceTypeEnum]) {
    return SERVICE_LABEL_MAP[serviceTypeEnum]
  }

  // Fallback: format enum value (FREELANCE_VISA → "Freelance Visa")
  return serviceTypeEnum
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Get service label with fallback to serviceType name
 */
export function getServiceDisplayLabel(
  serviceTypeEnum: string | null | undefined,
  serviceTypeName: string | null | undefined,
  requestedServiceRaw: string | null | undefined
): string {
  // Prefer DB serviceType name if available
  if (serviceTypeName) {
    return serviceTypeName
  }

  // Fallback to enum label
  if (serviceTypeEnum) {
    return getServiceLabel(serviceTypeEnum)
  }

  // Fallback to raw requested service
  if (requestedServiceRaw) {
    return requestedServiceRaw
  }

  return 'Not specified'
}

