/**
 * CENTRALIZED SERVICE MAPPING
 * 
 * Maps extracted service strings to Lead serviceTypeEnum/serviceTypeId.
 * This is the SINGLE SOURCE OF TRUTH for service mapping.
 */

import { prisma } from '../prisma'

/**
 * Map extracted service to Lead serviceTypeEnum and serviceTypeId
 */
export async function mapExtractedServiceToLeadServiceType(
  extractedService: string | undefined
): Promise<{
  serviceTypeEnum?: string
  serviceTypeId?: number
  requestedServiceRaw?: string
}> {
  if (!extractedService) {
    return {}
  }
  
  // Set serviceTypeEnum from extracted service
  const serviceTypeEnum = extractedService
  
  // Try to find matching ServiceType
  let serviceTypeId: number | undefined
  
  try {
    const serviceLower = extractedService.toLowerCase()
    const serviceSpaces = extractedService.replace(/_/g, ' ').toLowerCase()
    
    // Get all active service types and match in memory
    const allServiceTypes = await prisma.serviceType.findMany({
      where: { isActive: true },
    })
    
    const serviceType = allServiceTypes.find(st => {
      const nameLower = (st.name || '').toLowerCase()
      const codeLower = (st.code || '').toLowerCase()
      return (
        nameLower.includes(serviceLower) ||
        nameLower.includes(serviceSpaces) ||
        codeLower === serviceLower ||
        nameLower === serviceLower ||
        nameLower === serviceSpaces
      )
    })
    
    if (serviceType) {
      serviceTypeId = serviceType.id
    }
  } catch (error: any) {
    console.warn(`[SERVICE-MAPPING] Failed to match ServiceType:`, error.message)
  }
  
  return {
    serviceTypeEnum,
    serviceTypeId,
    requestedServiceRaw: extractedService, // Store raw for UI display
  }
}

/**
 * Handle "cheapest" keyword - set PRICE_SENSITIVE tag and recommended offer
 */
export function handleCheapestKeyword(): {
  tags?: string[]
  recommendedOffer?: string
} {
  return {
    tags: ['PRICE_SENSITIVE'],
    recommendedOffer: 'Professional Mainland License + Investor Visa for AED 12,999',
  }
}

/**
 * Handle "marketing license" - accept as business activity
 */
export function handleMarketingLicense(): {
  customServiceLabel?: string
  businessActivity?: string
} {
  return {
    customServiceLabel: 'Marketing License',
    businessActivity: 'Marketing License',
  }
}

