/**
 * AI Message Generation - WRAPPER AROUND ORCHESTRATOR
 * 
 * ⚠️ DEPRECATED: This file routes to orchestrator.
 * All new code should call orchestrator directly.
 */

import { generateAIReply } from './ai/orchestrator'
import { prisma } from './prisma'
import { upsertConversation } from './conversation/upsert'

type Lead = {
  id: number
  leadType: string | null
  status: string
  aiScore: number | null
  aiNotes: string | null
  expiryDate: Date | null
  contact: {
    fullName: string
    phone: string
    email: string | null
  }
}

/**
 * Generate an expiry reminder message using orchestrator
 */
export async function generateExpiryReminderMessage(
  lead: Lead,
  daysBefore: number
): Promise<string> {
  console.warn(`[DEPRECATED] generateExpiryReminderMessage called - routing to orchestrator`)
  
  try {
    // Load full lead
    const fullLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contact: true,
      },
    })
    
    if (!fullLead || !fullLead.contact) {
      throw new Error('Lead or contact not found')
    }
    
    // Find or create conversation
    const { id: conversationId } = await upsertConversation({
      contactId: fullLead.contact.id,
      channel: 'whatsapp',
      leadId: fullLead.id,
    })
    
    // Create a dummy inbound message for context
    const dummyMessage = await prisma.message.create({
      data: {
        conversationId,
        leadId: fullLead.id,
        contactId: fullLead.contact.id,
        direction: 'INBOUND',
        channel: 'whatsapp',
        type: 'text',
        body: `Reminder: My ${lead.leadType || 'service'} expires in ${daysBefore} days`,
        status: 'RECEIVED',
      },
    })
    
    // Call orchestrator
    const result = await generateAIReply({
      conversationId,
      leadId: fullLead.id,
      contactId: fullLead.contact.id,
      inboundText: dummyMessage.body || '',
      inboundMessageId: dummyMessage.id,
      channel: 'whatsapp',
      language: 'en',
    })
    
    // Delete dummy message
    await prisma.message.delete({ where: { id: dummyMessage.id } }).catch(() => {})
    
    return result.replyText || `Your ${lead.leadType || 'service'} expires in ${daysBefore} days. Please contact us to renew.`
  } catch (error: any) {
    console.error(`[AI-MESSAGE-GEN] Error:`, error)
    return `Your ${lead.leadType || 'service'} expires in ${daysBefore} days. Please contact us to renew.`
  }
}

/**
 * Generate follow-up message using orchestrator
 */
export async function generateFollowUpMessage(
  lead: Lead,
  lastMessages: Array<{ channel: string; messageSnippet: string | null }>
): Promise<string> {
  console.warn(`[DEPRECATED] generateFollowUpMessage called - routing to orchestrator`)
  
  try {
    // Load full lead
    const fullLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contact: true,
      },
    })
    
    if (!fullLead || !fullLead.contact) {
      throw new Error('Lead or contact not found')
    }
    
    // Find or create conversation
    const { id: conversationId } = await upsertConversation({
      contactId: fullLead.contact.id,
      channel: 'whatsapp',
      leadId: fullLead.id,
    })
    
    // Get latest inbound message or create dummy
    const latestInbound = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
    })
    
    const inboundText = latestInbound?.body || lastMessages[0]?.messageSnippet || 'Follow-up'
    const inboundMessageId = latestInbound?.id || 0
    
    // Call orchestrator
    const result = await generateAIReply({
      conversationId,
      leadId: fullLead.id,
      contactId: fullLead.contact.id,
      inboundText,
      inboundMessageId,
      channel: 'whatsapp',
      language: 'en',
    })
    
    return result.replyText || 'Thanks for your interest. How can we help you today?'
  } catch (error: any) {
    console.error(`[AI-MESSAGE-GEN] Error:`, error)
    return 'Thanks for your interest. How can we help you today?'
  }
}
