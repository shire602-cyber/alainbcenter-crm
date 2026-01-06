/**
 * Renewal Template Configuration
 * 
 * Maps service types to WhatsApp template names
 * Can be made database-driven in the future
 */

export interface TemplateConfig {
  serviceType: string
  templateName: string
  language?: string
}

/**
 * Get template name for service type
 * TODO: Make this database-driven via a TemplateMapping table
 */
export function getTemplateNameForService(serviceType: string): string | null {
  // Service type to template mapping
  // Template names must match approved WhatsApp templates in Meta
  const templateMap: Record<string, string> = {
    // Visa renewals
    'VISA_RENEWAL': 'visa_renewal_reminder',
    'EMPLOYMENT_VISA': 'visa_renewal_reminder',
    'FAMILY_VISA': 'visa_renewal_reminder',
    'FREELANCE_VISA': 'visa_renewal_reminder',
    'INVESTOR_PARTNER_VISA': 'visa_renewal_reminder',
    'GOLDEN_VISA': 'visa_renewal_reminder',
    'DOMESTIC_WORKER_VISA': 'visa_renewal_reminder',
    
    // Emirates ID
    'EMIRATES_ID_RENEWAL': 'emirates_id_renewal_reminder',
    'EMIRATES_ID': 'emirates_id_renewal_reminder',
    
    // Passport
    'PASSPORT_RENEWAL': 'passport_renewal_reminder',
    'PASSPORT_EXPIRY': 'passport_renewal_reminder',
    
    // Trade License
    'TRADE_LICENSE_RENEWAL': 'trade_license_renewal_reminder',
    'TRADE_LICENSE_EXPIRY': 'trade_license_renewal_reminder',
    
    // Establishment Card
    'ESTABLISHMENT_CARD_RENEWAL': 'establishment_card_renewal_reminder',
    'ESTABLISHMENT_CARD_EXPIRY': 'establishment_card_renewal_reminder',
    
    // Medical
    'MEDICAL_FITNESS_EXPIRY': 'medical_renewal_reminder',
    'MEDICAL_BIOMETRICS': 'medical_renewal_reminder',
    
    // Insurance
    'INSURANCE_EXPIRY': 'insurance_renewal_reminder',
    
    // Generic fallback
    'RENEWAL': 'generic_renewal_reminder',
  }

  // Try exact match first
  if (templateMap[serviceType]) {
    return templateMap[serviceType]
  }

  // Try case-insensitive match
  const upperServiceType = serviceType.toUpperCase()
  for (const [key, template] of Object.entries(templateMap)) {
    if (key.toUpperCase() === upperServiceType) {
      return template
    }
  }

  // Try partial match (e.g., "VISA" in "EMPLOYMENT_VISA")
  for (const [key, template] of Object.entries(templateMap)) {
    if (upperServiceType.includes(key) || key.includes(upperServiceType)) {
      return template
    }
  }

  // No match found
  console.warn(`[RENEWAL-TEMPLATE] No template mapping found for service type: ${serviceType}`)
  return null
}

/**
 * Get all configured template mappings
 * Useful for admin UI to show available mappings
 */
export function getAllTemplateMappings(): TemplateConfig[] {
  return [
    { serviceType: 'VISA_RENEWAL', templateName: 'visa_renewal_reminder' },
    { serviceType: 'EMIRATES_ID_RENEWAL', templateName: 'emirates_id_renewal_reminder' },
    { serviceType: 'PASSPORT_RENEWAL', templateName: 'passport_renewal_reminder' },
    { serviceType: 'TRADE_LICENSE_RENEWAL', templateName: 'trade_license_renewal_reminder' },
    { serviceType: 'ESTABLISHMENT_CARD_RENEWAL', templateName: 'establishment_card_renewal_reminder' },
  ]
}

