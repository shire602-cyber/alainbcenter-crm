/**
 * Info/Quotation Sharing Detection (Phase 2)
 * 
 * Detects when information or quotation is shared with customers
 * and triggers follow-up automation
 */

import { prisma } from '../prisma'
import { runRuleOnLead, AutomationContext } from './engine'

/**
 * Detect if a message contains info/quotation keywords
 */
export function detectInfoOrQuotationShared(messageText: string): {
  isInfoShared: boolean
  isQuotationShared: boolean
  infoType: 'pricing' | 'brochure' | 'document' | 'details' | 'quotation' | null
} {
  const text = messageText.toLowerCase()

  // Quotation keywords
  const quotationKeywords = ['quote', 'quotation', 'pricing', 'price list', 'cost', 'fee', 'fees', 'estimate', 'proposal']
  const isQuotationShared = quotationKeywords.some(keyword => text.includes(keyword))

  // Info keywords
  const infoKeywords = ['information', 'details', 'brochure', 'document', 'file', 'attached', 'here is', 'sent you', 'shared']
  const isInfoShared = infoKeywords.some(keyword => text.includes(keyword)) || isQuotationShared

  // Determine info type
  let infoType: 'pricing' | 'brochure' | 'document' | 'details' | 'quotation' | null = null
  if (isQuotationShared || text.includes('pricing') || text.includes('price')) {
    infoType = 'quotation'
  } else if (text.includes('brochure') || text.includes('catalog')) {
    infoType = 'brochure'
  } else if (text.includes('document') || text.includes('file') || text.includes('attached')) {
    infoType = 'document'
  } else if (text.includes('details') || text.includes('information')) {
    infoType = 'details'
  } else if (isInfoShared) {
    infoType = 'details' // Default
  }

  return {
    isInfoShared,
    isQuotationShared,
    infoType,
  }
}

/**
 * Mark info/quotation as shared on a lead
 */
export async function markInfoShared(
  leadId: number,
  infoType: 'pricing' | 'brochure' | 'document' | 'details' | 'quotation'
): Promise<void> {
  const now = new Date()
  // Use raw update for new fields (will work after migration is applied)
  const updateData: any = {
    infoSharedAt: now,
    lastInfoSharedType: infoType,
  }

  // If it's a quotation, also set quotationSentAt
  if (infoType === 'quotation') {
    updateData.quotationSentAt = now
  }

  // Migration applied - fields now exist in schema
  // Add try-catch to handle case where migration hasn't been applied yet
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    })
  } catch (error: any) {
    // If column doesn't exist, migration hasn't been applied yet
    if (error.code === 'P2022' || error.message?.includes('does not exist')) {
      console.warn(`⚠️ Migration not applied yet for lead ${leadId}. Please run /api/admin/migrate`)
      // Don't throw - allow message processing to continue
      return
    }
    throw error
  }

  console.log(`✅ Marked info shared for lead ${leadId}: ${infoType}`)

  // Trigger INFO_SHARED automation (non-blocking)
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!lead) {
      return
    }

    // Get active INFO_SHARED rules
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        enabled: true,
        trigger: 'INFO_SHARED',
      },
    })

    if (rules.length === 0) {
      return // No rules configured
    }

    // Build context
    const context: AutomationContext = {
      lead,
      contact: lead.contact,
      expiries: lead.expiryItems,
      recentMessages: lead.messages,
      triggerData: {
        infoType,
        sharedAt: now,
      },
    }

    // Run each rule (non-blocking)
    for (const rule of rules) {
      try {
        await runRuleOnLead(rule, context)
      } catch (error: any) {
        console.error(`Error running INFO_SHARED rule ${rule.id} for lead ${leadId}:`, error.message)
      }
    }
  } catch (error: any) {
    console.error(`Error triggering INFO_SHARED automation for lead ${leadId}:`, error.message)
  }
}

