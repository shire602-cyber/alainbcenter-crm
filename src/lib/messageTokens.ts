/**
 * Token replacement helper for AI-generated messages
 * Replaces simple tokens like {name}, {service}, {expiry_date} with actual lead data
 */

type LeadData = {
    contact?: {
      fullName?: string | null
      phone?: string | null
      email?: string | null
      companyName?: string | null
      localSponsorName?: string | null
    } | null
    serviceType?: {
      name?: string | null
    } | null
    serviceTypeEnum?: string | null
    expiryDate?: string | null
    nextFollowUpAt?: string | null
    stage?: string | null
  }
  
  /**
   * Replace tokens in a message template with actual lead data
   */
  export function replaceMessageTokens(template: string, lead: LeadData): string {
    let result = template
    // Use helper to get proper greeting name (never "Unknown WHATSAPP User")
    const { getGreetingName } = require('./message-utils')
    const name = getGreetingName(lead.contact) || 'there'
    result = result.replace(/{name}/gi, name)
    result = result.replace(/{phone}/gi, lead.contact?.phone || '')
    result = result.replace(/{email}/gi, lead.contact?.email || '')
    const service = lead.serviceType?.name || lead.serviceTypeEnum?.replace(/_/g, ' ') || 'our service'
    result = result.replace(/{service}/gi, service)
    if (lead.expiryDate) {
      const expiryDate = new Date(lead.expiryDate)
      const formattedExpiry = expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      result = result.replace(/{expiry_date}/gi, formattedExpiry)
    } else {
      result = result.replace(/{expiry_date}/gi, 'your expiry date')
    }
    if (lead.nextFollowUpAt) {
      const followupDate = new Date(lead.nextFollowUpAt)
      const formattedFollowup = followupDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      result = result.replace(/{followup_date}/gi, formattedFollowup)
    } else {
      result = result.replace(/{followup_date}/gi, 'the scheduled date')
    }
    result = result.replace(/{company}/gi, lead.contact?.companyName || 'your company')
    result = result.replace(/{sponsor}/gi, lead.contact?.localSponsorName || 'your sponsor')
    result = result.replace(/{stage}/gi, lead.stage?.replace(/_/g, ' ') || 'current stage')
    return result
  }