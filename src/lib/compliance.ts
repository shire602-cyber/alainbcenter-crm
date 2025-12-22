/**
 * Compliance Intelligence Helper
 * 
 * Analyzes lead document compliance status and provides actionable insights
 */

import { prisma } from './prisma'

export type ComplianceStatus = 'GOOD' | 'WARNING' | 'CRITICAL'

export interface ComplianceResult {
  status: ComplianceStatus
  missingMandatory: string[]
  expiringSoon: string[]
  expired: string[]
  notes: string
  score: number // 0-100 compliance score
}

/**
 * Get compliance status for a lead
 */
export async function getLeadComplianceStatus(leadId: number): Promise<ComplianceResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      documents: {
        orderBy: { createdAt: 'desc' },
      },
      serviceType: true,
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  const serviceType = lead.serviceTypeEnum || lead.serviceType?.name || ''
  const now = new Date()

  // Get ALL required documents for this service type (mandatory and optional)
  const allRequirements = await prisma.serviceDocumentRequirement.findMany({
    where: {
      serviceType: serviceType,
    },
    orderBy: { order: 'asc' },
  })

  // Separate mandatory and optional
  const requirements = allRequirements.filter(r => r.isMandatory)
  const optionalRequirements = allRequirements.filter(r => !r.isMandatory)

  // Get uploaded documents
  const uploadedDocs = lead.documents || []

  // Check compliance
  const missingMandatory: string[] = []
  const expiringSoon: string[] = []
  const expired: string[] = []

  for (const requirement of requirements) {
    // Check if document exists
    const matchingDoc = uploadedDocs.find(
      (doc) => doc.category?.toLowerCase() === requirement.documentType.toLowerCase()
    )

    if (!matchingDoc) {
      missingMandatory.push(requirement.label)
    } else if (matchingDoc.expiryDate) {
      // Check expiry
      const expiryDate = new Date(matchingDoc.expiryDate)
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntilExpiry < 0) {
        expired.push(`${requirement.label} (expired ${Math.abs(daysUntilExpiry)} days ago)`)
      } else if (daysUntilExpiry <= 30) {
        expiringSoon.push(`${requirement.label} (expires in ${daysUntilExpiry} days)`)
      }
    }
  }

  // Calculate compliance score
  const totalMandatory = requirements.length
  const missingCount = missingMandatory.length
  const expiredCount = expired.length
  const expiringCount = expiringSoon.length

  let score = 100
  if (totalMandatory > 0) {
    score -= (missingCount / totalMandatory) * 50 // Missing docs: -50 points
    score -= (expiredCount / totalMandatory) * 40 // Expired docs: -40 points
    score -= (expiringCount / totalMandatory) * 10 // Expiring soon: -10 points
  }
  score = Math.max(0, Math.min(100, score))

  // Determine status
  let status: ComplianceStatus = 'GOOD'
  let notes = ''

  if (expired.length > 0) {
    status = 'CRITICAL'
    notes = `${expired.length} document(s) expired. Immediate action required.`
  } else if (missingMandatory.length > 0 || expiringSoon.length > 0) {
    status = 'WARNING'
    if (missingMandatory.length > 0) {
      notes = `${missingMandatory.length} mandatory document(s) missing.`
    }
    if (expiringSoon.length > 0) {
      notes += ` ${expiringSoon.length} document(s) expiring soon.`
    }
  } else {
    notes = 'All required documents are up to date.'
  }

  return {
    status,
    missingMandatory,
    expiringSoon,
    expired,
    notes,
    score,
  }
}

/**
 * Get compliance summary for multiple leads
 */
export async function getBulkComplianceStatus(
  leadIds: number[]
): Promise<Map<number, ComplianceResult>> {
  const results = new Map<number, ComplianceResult>()

  for (const leadId of leadIds) {
    try {
      const status = await getLeadComplianceStatus(leadId)
      results.set(leadId, status)
    } catch (error) {
      console.error(`Failed to get compliance for lead ${leadId}:`, error)
    }
  }

  return results
}

















