/**
 * LEAD PLAYBOOKS - DETERMINISTIC WORKFLOWS
 * 
 * Playbooks are predefined workflows that do real work:
 * - Send templated messages
 * - Create tasks
 * - Update stage
 * - Log activity events
 * 
 * All playbooks are deterministic (no LLM calls).
 * Templates use variable substitution from knownFields.
 */

export type PlaybookKey = 
  | 'request_docs'
  | 'send_pricing'
  | 'renewal_reminder'
  | 'quote_followup'

export interface PlaybookResult {
  messageTemplateKey: string
  messageBody: string
  tasksToCreate: Array<{
    type: string
    title: string
    dueAt?: Date
    description?: string
  }>
  stageUpdate?: string
  activityEvent: {
    type: string
    description: string
    metadata?: Record<string, any>
  }
}

export interface PlaybookContext {
  lead: {
    id: number
    stage?: string | null
    serviceType?: {
      name?: string
      key?: string
    } | null
    contact?: {
      fullName?: string | null
      phone?: string | null
    } | null
  }
  knownFields: Record<string, any>
  conversationId?: number
}

/**
 * Get available playbooks for a lead based on service type and stage
 */
export function getAvailablePlaybooks(
  serviceType?: string | null,
  stage?: string | null
): PlaybookKey[] {
  const serviceKey = serviceType?.toLowerCase() || ''
  const isBusinessSetup = serviceKey.includes('business') || serviceKey.includes('setup')
  const isVisa = serviceKey.includes('visa')
  
  const playbooks: PlaybookKey[] = []
  
  // Request docs: business setup in early stages
  if (isBusinessSetup && stage && ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED'].includes(stage)) {
    playbooks.push('request_docs')
  }
  
  // Send pricing: qualified or proposal stage
  if (stage && ['QUALIFIED', 'PROPOSAL_SENT'].includes(stage)) {
    playbooks.push('send_pricing')
  }
  
  // Renewal reminder: any lead with expiry
  playbooks.push('renewal_reminder')
  
  // Quote followup: proposal/quote sent
  if (stage && ['PROPOSAL_SENT', 'QUOTE_SENT'].includes(stage)) {
    playbooks.push('quote_followup')
  }
  
  return playbooks
}

/**
 * Execute a playbook and return the actions to take
 */
export function executePlaybook(
  playbookKey: PlaybookKey,
  context: PlaybookContext
): PlaybookResult {
  const { lead, knownFields } = context
  const contactName = lead.contact?.fullName || knownFields.name || 'there'
  const serviceName = lead.serviceType?.name || 'service'
  
  switch (playbookKey) {
    case 'request_docs': {
      const requiredDocs = getRequiredDocuments(lead.serviceType?.key || '')
      const docsList = requiredDocs.join(', ')
      
      return {
        messageTemplateKey: 'request_docs',
        messageBody: `Hi ${contactName},\n\nTo proceed with your ${serviceName} application, we need the following documents:\n\n${docsList}\n\nPlease share these documents at your earliest convenience. If you have any questions, feel free to ask!\n\nBest regards`,
        tasksToCreate: [
          {
            type: 'DOC_COLLECTION',
            title: `Collect documents for ${serviceName}`,
            description: `Required: ${docsList}`,
            dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          }
        ],
        stageUpdate: lead.stage === 'NEW' ? 'CONTACTED' : undefined,
        activityEvent: {
          type: 'PLAYBOOK_EXECUTED',
          description: `Requested documents via playbook`,
          metadata: { playbookKey, requiredDocs },
        },
      }
    }
    
    case 'send_pricing': {
      return {
        messageTemplateKey: 'send_pricing',
        messageBody: `Hi ${contactName},\n\nThank you for your interest in our ${serviceName} services.\n\nI'll prepare a detailed quote for you and send it shortly. In the meantime, if you have any questions or specific requirements, please let me know!\n\nBest regards`,
        tasksToCreate: [
          {
            type: 'QUOTE',
            title: `Prepare quote for ${serviceName}`,
            dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
          }
        ],
        stageUpdate: lead.stage === 'QUALIFIED' ? 'PROPOSAL_SENT' : undefined,
        activityEvent: {
          type: 'PLAYBOOK_EXECUTED',
          description: `Sent pricing information via playbook`,
          metadata: { playbookKey },
        },
      }
    }
    
    case 'renewal_reminder': {
      const expiryDate = knownFields.expiryDate || knownFields.visaExpiryDate
      const expiryText = expiryDate 
        ? new Date(expiryDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'soon'
      
      return {
        messageTemplateKey: 'renewal_reminder',
        messageBody: `Hi ${contactName},\n\nThis is a friendly reminder that your ${serviceName} expires on ${expiryText}.\n\nTo ensure uninterrupted service, we recommend starting the renewal process now. Would you like to schedule a renewal consultation?\n\nBest regards`,
        tasksToCreate: [
          {
            type: 'RENEWAL',
            title: `Renewal reminder for ${serviceName}`,
            description: `Expiry: ${expiryText}`,
            dueAt: expiryDate ? new Date(new Date(expiryDate).getTime() - 30 * 24 * 60 * 60 * 1000) : undefined, // 30 days before
          }
        ],
        activityEvent: {
          type: 'PLAYBOOK_EXECUTED',
          description: `Sent renewal reminder via playbook`,
          metadata: { playbookKey, expiryDate },
        },
      }
    }
    
    case 'quote_followup': {
      return {
        messageTemplateKey: 'quote_followup',
        messageBody: `Hi ${contactName},\n\nI wanted to follow up on the quote I sent for your ${serviceName}.\n\nDo you have any questions or would you like to discuss the pricing? I'm here to help!\n\nBest regards`,
        tasksToCreate: [
          {
            type: 'FOLLOW_UP',
            title: `Follow up on ${serviceName} quote`,
            dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
          }
        ],
        activityEvent: {
          type: 'PLAYBOOK_EXECUTED',
          description: `Sent quote follow-up via playbook`,
          metadata: { playbookKey },
        },
      }
    }
    
    default:
      throw new Error(`Unknown playbook: ${playbookKey}`)
  }
}

/**
 * Get required documents based on service type
 */
function getRequiredDocuments(serviceKey: string): string[] {
  const key = serviceKey.toLowerCase()
  
  if (key.includes('business') || key.includes('setup')) {
    return [
      'Passport copy',
      'Emirates ID copy',
      'Visa copy (if applicable)',
      'Trade license (if renewing)',
      'Memorandum of Association',
    ]
  }
  
  if (key.includes('visa')) {
    return [
      'Passport copy',
      'Passport photo',
      'Emirates ID copy',
      'Medical fitness certificate',
      'Entry permit (if applicable)',
    ]
  }
  
  return [
    'Passport copy',
    'Emirates ID copy',
    'Relevant documents',
  ]
}

