export interface RenewalDraftParams {
  expiryItem: {
    id: number
    type: string
    expiryDate: Date
    notes?: string | null
  }
  lead: {
    id: number
    serviceTypeEnum?: string | null
    stage: string
  }
  contact: {
    fullName: string
    phone?: string | null
    email?: string | null
  }
  stage: '90D' | '60D' | '30D' | '7D' | 'EXPIRED'
}

export interface RenewalDraftResult {
  text: string
  suggestedChannel: 'WHATSAPP' | 'EMAIL' | 'INTERNAL'
  language: 'en' | 'ar'
}

/**
 * Generate AI-powered renewal message draft
 * Uses the existing /api/ai/draft-reply endpoint with renewal objective
 */
export async function generateRenewalDraft(
  params: RenewalDraftParams
): Promise<RenewalDraftResult> {
  const { expiryItem, lead, contact, stage } = params

  // Calculate days until expiry
  const now = new Date()
  const expiryDate = new Date(expiryItem.expiryDate)
  const daysUntilExpiry = Math.floor(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Map expiry type to service name
  const expiryTypeMap: Record<string, string> = {
    VISA_EXPIRY: 'Visa',
    EMIRATES_ID_EXPIRY: 'Emirates ID',
    PASSPORT_EXPIRY: 'Passport',
    TRADE_LICENSE_EXPIRY: 'Trade License',
    ESTABLISHMENT_CARD_EXPIRY: 'Establishment Card',
    MEDICAL_FITNESS_EXPIRY: 'Medical Fitness Certificate',
    MOHRE_LABOUR_CARD_EXPIRY: 'MOHRE Labour Card',
    EJARI_OFFICE_LEASE_EXPIRY: 'Ejari Office Lease',
  }

  const serviceName = expiryTypeMap[expiryItem.type] || expiryItem.type.replace(/_/g, ' ')

  // Try to use AI via API endpoint if available
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    try {
      const response = await fetch(`${baseUrl}/api/ai/draft-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({
          leadId: lead.id,
          objective: 'renewal',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.draftText) {
          // Enhance the AI-generated draft with renewal-specific details if needed
          let enhancedText = data.draftText
          
          // If the draft doesn't mention days remaining, add it
          if (!enhancedText.includes(`${daysUntilExpiry}`) && !enhancedText.includes('expires')) {
            const daysText = daysUntilExpiry < 0 
              ? `Your ${serviceName} has expired.`
              : `Your ${serviceName} expires in ${daysUntilExpiry} days.`
            enhancedText = `${daysText}\n\n${enhancedText}`
          }

          return {
            text: enhancedText,
            suggestedChannel: 'WHATSAPP',
            language: data.language || 'en',
          }
        }
      }
    } catch (error) {
      console.error('AI renewal draft generation failed, using template:', error)
    }
  }

  // Fallback to template-based message
  return {
    text: buildTemplateRenewalMessage({
      contactName: contact.fullName,
      expiryType: serviceName,
      daysRemaining: daysUntilExpiry,
      stage,
      isExpired: daysUntilExpiry < 0,
    }),
    suggestedChannel: 'WHATSAPP',
    language: 'en',
  }
}

function buildTemplateRenewalMessage(context: {
  contactName: string
  expiryType: string
  daysRemaining: number
  stage: string
  isExpired: boolean
}): string {
  const { contactName, expiryType, daysRemaining, stage, isExpired } = context

  let urgencyText = ''
  if (isExpired) {
    urgencyText = `Your ${expiryType} has expired. `
  } else if (stage === '7D') {
    urgencyText = `Urgent: Your ${expiryType} expires in ${Math.abs(daysRemaining)} days. `
  } else if (stage === '30D') {
    urgencyText = `Important: Your ${expiryType} expires in ${daysRemaining} days. `
  } else {
    urgencyText = `Your ${expiryType} expires in ${daysRemaining} days. `
  }

  const message = `Assalamu Alaikum ${contactName},

${urgencyText}We're here to help you renew it smoothly.

Please reply:
1️⃣ To start renewal now
2️⃣ To discuss options
3️⃣ If you've already renewed elsewhere

Thank you for your trust in Alain Business Center.`

  return message
}
















