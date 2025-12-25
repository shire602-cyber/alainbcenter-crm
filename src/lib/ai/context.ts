import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

export interface ConversationContext {
  contact: {
    name: string
    phone: string
    email: string | null
    nationality: string | null
  }
  lead: {
    id: number
    leadType: string | null
    serviceType: string | null
    status: string
    pipelineStage: string
    expiryDate: Date | null
    nextFollowUpAt: Date | null
    aiScore: number | null
    aiNotes: string | null
  } | null
  messages: Array<{
    direction: string
    message: string
    channel: string
    createdAt: Date
  }>
  companyIdentity: string
}

export interface ContextSummary {
  text: string
  structured: ConversationContext
}

/**
 * Build conversation context for AI prompts
 * Gathers contact, lead, and last 10 messages
 */
export async function buildConversationContext(
  contactId: number
): Promise<ContextSummary> {
  // Get contact with latest lead
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      leads: {
        include: {
          serviceType: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!contact) {
    throw new Error('Contact not found')
  }

  const latestLead = contact.leads[0] || null

  // Get last 10 messages from ChatMessage
  const chatMessages = await prisma.chatMessage.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Get last 10 communication logs if lead exists
  const communicationLogs = latestLead
    ? await prisma.communicationLog.findMany({
        where: { leadId: latestLead.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    : []

  // Combine and sort messages
  const allMessages = [
    ...chatMessages.map((msg) => ({
      direction: msg.direction,
      message: msg.message,
      channel: msg.channel,
      createdAt: msg.createdAt,
    })),
    ...communicationLogs.map((log) => ({
      direction: log.direction,
      message: log.messageSnippet || '',
      channel: log.channel,
      createdAt: log.createdAt,
    })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-10) // Last 10 messages

  const context: ConversationContext = {
    contact: {
      name: contact.fullName,
      phone: contact.phone,
      email: contact.email,
      nationality: contact.nationality,
    },
    lead: latestLead
      ? {
          id: latestLead.id,
          leadType: latestLead.leadType,
          serviceType: latestLead.serviceType?.name || null,
          status: latestLead.status,
          pipelineStage: latestLead.pipelineStage,
          expiryDate: latestLead.expiryDate,
          nextFollowUpAt: latestLead.nextFollowUpAt,
          aiScore: latestLead.aiScore,
          aiNotes: latestLead.aiNotes,
        }
      : null,
    messages: allMessages,
    companyIdentity: 'Al Ain Business Center – UAE business setup & visa services',
  }

  // Build text summary
  const summaryParts: string[] = []

  summaryParts.push(`Contact: ${contact.fullName}`)
  if (contact.nationality) {
    summaryParts.push(`Nationality: ${contact.nationality}`)
  }
  if (contact.email) {
    summaryParts.push(`Email: ${contact.email}`)
  }
  summaryParts.push(`Phone: ${contact.phone}`)

  if (latestLead) {
    summaryParts.push(`\nLead Information:`)
    summaryParts.push(`Service: ${latestLead.serviceType?.name || latestLead.leadType || 'Not specified'}`)
    summaryParts.push(`Status: ${latestLead.status}`)
    summaryParts.push(`Pipeline Stage: ${latestLead.pipelineStage}`)
    if (latestLead.expiryDate) {
      summaryParts.push(`Expiry Date: ${format(latestLead.expiryDate, 'MMM d, yyyy')}`)
      const daysUntil = Math.ceil(
        (latestLead.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
      summaryParts.push(`Days until expiry: ${daysUntil}`)
    }
    if (latestLead.nextFollowUpAt) {
      summaryParts.push(`Next Follow-up: ${format(latestLead.nextFollowUpAt, 'MMM d, yyyy')}`)
    }
    if (latestLead.aiScore !== null) {
      summaryParts.push(`AI Score: ${latestLead.aiScore}/100`)
    }
    if (latestLead.aiNotes) {
      summaryParts.push(`AI Notes: ${latestLead.aiNotes}`)
    }
  } else {
    summaryParts.push(`\nNo lead created yet`)
  }

  summaryParts.push(`\nRecent Messages (last ${allMessages.length}):`)
  allMessages.forEach((msg, idx) => {
    const time = format(msg.createdAt, 'MMM d, HH:mm')
    const messageText = (msg.message || '').substring(0, 150)
    summaryParts.push(
      `${idx + 1}. [${msg.direction.toUpperCase()}] ${time} (${msg.channel}): ${messageText}`
    )
  })

  return {
    text: summaryParts.join('\n'),
    structured: context,
  }
}
/**
 * Build conversation context from leadId (instead of contactId)
 * Used for lead-specific AI drafts
 */
export async function buildConversationContextFromLead(
  leadId: number,
  channel?: string
): Promise<ContextSummary> {
  // Get lead with contact
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      serviceType: true,
      conversations: channel
        ? {
            where: { channel: channel.toLowerCase() },
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
            },
          }
        : {
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 1,
          },
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  // Get messages from conversations or ChatMessage/CommunicationLog
  const conversationMessages = lead.conversations[0]?.messages || []
  const chatMessages = await prisma.chatMessage.findMany({
    where: { contactId: lead.contactId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const communicationLogs = await prisma.communicationLog.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Also check for documents
  const documents = await prisma.document.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      fileName: true,
      category: true,
      createdAt: true,
    },
  })

  // Combine and sort messages
  const allMessages = [
    ...conversationMessages.map((msg: any) => ({
      direction: msg.direction === 'INBOUND' || msg.direction === 'IN' ? 'inbound' : 'outbound',
      message: msg.body || '',
      channel: msg.channel || 'whatsapp',
      createdAt: msg.createdAt,
    })),
    ...chatMessages.map((msg) => ({
      direction: msg.direction,
      message: msg.message,
      channel: msg.channel,
      createdAt: msg.createdAt,
    })),
    ...communicationLogs.map((log) => ({
      direction: log.direction,
      message: log.messageSnippet || log.body || '',
      channel: log.channel,
      createdAt: log.createdAt,
    })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-10) // Last 10 messages

  const context: ConversationContext = {
    contact: {
      name: lead.contact.fullName,
      phone: lead.contact.phone,
      email: lead.contact.email,
      nationality: lead.contact.nationality,
    },
    lead: {
      id: lead.id,
      leadType: lead.leadType,
      serviceType: lead.serviceType?.name || null,
      status: lead.status,
      pipelineStage: lead.pipelineStage,
      expiryDate: lead.expiryDate,
      nextFollowUpAt: lead.nextFollowUpAt,
      aiScore: lead.aiScore,
      aiNotes: lead.aiNotes,
    },
    messages: allMessages,
    documents: documents.map(doc => ({
      fileName: doc.fileName,
      category: doc.category || 'OTHER',
      createdAt: doc.createdAt,
    })),
    companyIdentity: 'Al Ain Business Center – UAE business setup & visa services',
  }

  // Build text summary
  const summaryParts: string[] = []
  summaryParts.push(`Contact: ${lead.contact.fullName}`)
  if (lead.contact.nationality) {
    summaryParts.push(`Nationality: ${lead.contact.nationality}`)
  }
  if (lead.contact.email) {
    summaryParts.push(`Email: ${lead.contact.email}`)
  }
  summaryParts.push(`Phone: ${lead.contact.phone}`)
  summaryParts.push(`\nLead Information:`)
  summaryParts.push(`Service: ${lead.serviceType?.name || lead.leadType || 'Not specified'}`)
  summaryParts.push(`Status: ${lead.status}`)
  summaryParts.push(`Pipeline Stage: ${lead.pipelineStage}`)
  if (lead.expiryDate) {
    summaryParts.push(`Expiry Date: ${format(lead.expiryDate, 'MMM d, yyyy')}`)
  }
  if (lead.nextFollowUpAt) {
    summaryParts.push(`Next Follow-up: ${format(lead.nextFollowUpAt, 'MMM d, yyyy')}`)
  }
  if (lead.aiScore !== null) {
    summaryParts.push(`AI Score: ${lead.aiScore}/100`)
  }
  if (lead.aiNotes) {
    summaryParts.push(`AI Notes: ${lead.aiNotes}`)
  }
  summaryParts.push(`\nRecent Messages (last ${allMessages.length}):`)
  allMessages.forEach((msg, idx) => {
    const time = format(msg.createdAt, 'MMM d, HH:mm')
    const messageText = (msg.message || '').substring(0, 150)
    summaryParts.push(
      `${idx + 1}. [${msg.direction.toUpperCase()}] ${time} (${msg.channel}): ${messageText}`
    )
  })

  return {
    text: summaryParts.join('\n'),
    structured: context,
  }
}






















