/**
 * AI Messaging Helper
 * Generates AI-powered replies for automation
 */

import { prisma } from './prisma'

/**
 * Build WhatsApp template message for expiry reminders
 */
export function buildWhatsAppTemplateForExpiry(lead: any, daysBefore: number): string {
  // Use helper to get proper greeting (never "Unknown WHATSAPP User")
  const { getGreeting } = require('./message-utils')
  const greeting = getGreeting(lead.contact, 'casual')
  const expiryType = lead.leadType || 'service'
  const expiryDate = lead.expiryDate ? new Date(lead.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'soon'
  
  if (daysBefore === 7) {
    return `${greeting}, urgent reminder: Your ${expiryType} expires in 7 days (${expiryDate}). Please contact us immediately to renew. We're here to help!`
  } else if (daysBefore === 30) {
    return `${greeting}, your ${expiryType} expires in 30 days (${expiryDate}). Let's schedule your renewal to avoid any delays. Reply to this message to get started!`
  } else if (daysBefore === 60) {
    return `${greeting}, friendly reminder: Your ${expiryType} expires in 60 days (${expiryDate}). We can help you renew smoothly. Would you like to schedule a call?`
  } else {
    return `${greeting}, your ${expiryType} expires in ${daysBefore} days (${expiryDate}). We're here to assist with your renewal. Please let us know if you have any questions!`
  }
}

/**
 * Build email template for expiry reminders
 */
export function buildEmailTemplateForExpiry(lead: any, daysBefore: number): string {
  // Use helper to get proper greeting (never "Unknown WHATSAPP User")
  const { getGreeting } = require('./message-utils')
  const greeting = getGreeting(lead.contact, 'formal')
  const expiryType = lead.leadType || 'service'
  const expiryDate = lead.expiryDate ? new Date(lead.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'soon'
  
  return `${greeting},

This is a reminder that your ${expiryType} expires in ${daysBefore} days (${expiryDate}).

To ensure a smooth renewal process, we recommend starting the renewal procedure as soon as possible.

Please contact us if you have any questions or would like to schedule a consultation.

Best regards,
Alain Business Center`
}

/**
 * Build email subject for expiry reminders
 */
export function buildEmailSubjectForExpiry(daysBefore: number, serviceType: string): string {
  if (daysBefore === 7) {
    return `URGENT: ${serviceType} Renewal - Expires in 7 Days`
  } else if (daysBefore === 30) {
    return `Action Required: ${serviceType} Renewal - 30 Days Remaining`
  } else {
    return `Reminder: ${serviceType} Renewal - ${daysBefore} Days Remaining`
  }
}

export type AIMessageMode = 'FOLLOW_UP' | 'QUALIFY' | 'RENEWAL' | 'GENERIC' | 'PRICING' | 'DOCS' | 'REMIND' | 'BOOK_CALL'

export interface AIMessageContext {
  lead: any
  contact: any
  recentMessages?: any[]
  mode: AIMessageMode
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
  language?: 'en' | 'ar' // Preferred language for response
}

/**
 * Analyze conversation state to determine what information is missing
 */
function analyzeConversationState(lead: any, contact: any, recentMessages: any[]): {
  hasService: boolean
  hasNationality: boolean
  hasExpiryInfo: boolean
  hasLocation: boolean
  nextStep: 'service' | 'nationality' | 'other_info' | 'book_call' | 'assign_human'
} {
  // Extract all inbound message text
  const allInboundMessages = recentMessages
    .filter(m => (m.direction === 'INBOUND' || m.direction === 'inbound'))
    .map(m => (m.body || '').toLowerCase())
    .join(' ')
  
  // Check if service is known (from lead or mentioned in messages)
  const serviceKeywords = [
    'visa', 'family visa', 'employment visa', 'work visa', 'business setup', 'company setup',
    'renewal', 'freelance', 'investor', 'golden visa', 'emirates id', 'medical',
    'تأشيرة', 'عائلية', 'عمل', 'شركة', 'تجديد', 'هوية'
  ]
  const hasServiceInLead = !!(lead.serviceType || lead.serviceTypeEnum || lead.leadType)
  const hasServiceInMessages = serviceKeywords.some(keyword => allInboundMessages.includes(keyword.toLowerCase()))
  const hasService = hasServiceInLead || hasServiceInMessages
  
  // Check if nationality is known (from contact or mentioned in messages)
  const nationalityKeywords = [
    'indian', 'pakistani', 'filipino', 'egyptian', 'british', 'american', 'canadian',
    'indian', 'pakistani', 'filipino', 'egyptian', 'british', 'american', 'canadian',
    'هندي', 'باكستاني', 'فلبيني', 'مصري', 'بريطاني', 'أمريكي'
  ]
  const hasNationalityInContact = !!contact?.nationality
  const hasNationalityInMessages = nationalityKeywords.some(keyword => allInboundMessages.includes(keyword.toLowerCase()))
  const hasNationality = hasNationalityInContact || hasNationalityInMessages
  
  // Check if expiry info is known (from lead or mentioned in messages)
  const expiryPattern = /(expir|expir|ends?|due|valid until|valid till|expiry date|expires?|ينتهي|تاريخ انتهاء)/i
  const hasExpiryInfo = !!lead.expiryDate || expiryPattern.test(allInboundMessages)
  
  // Check if location is mentioned in messages
  const locationKeywords = [
    'uae', 'dubai', 'abu dhabi', 'sharjah', 'inside', 'outside', 'in uae', 'out of uae',
    'داخل', 'خارج', 'الإمارات', 'دبي', 'أبو ظبي', 'الشارقة'
  ]
  const hasLocation = locationKeywords.some(keyword => allInboundMessages.includes(keyword.toLowerCase()))
  
  // Determine next step based on what's missing
  if (!hasService) {
    return { hasService: false, hasNationality, hasExpiryInfo, hasLocation, nextStep: 'service' }
  }
  if (!hasNationality) {
    return { hasService: true, hasNationality: false, hasExpiryInfo, hasLocation, nextStep: 'nationality' }
  }
  if (!hasExpiryInfo && !hasLocation) {
    return { hasService: true, hasNationality: true, hasExpiryInfo: false, hasLocation: false, nextStep: 'other_info' }
  }
  // If we have service, nationality, and some other info, offer to book call
  if (hasService && hasNationality && (hasExpiryInfo || hasLocation)) {
    return { hasService: true, hasNationality: true, hasExpiryInfo, hasLocation, nextStep: 'book_call' }
  }
  
  return { hasService, hasNationality, hasExpiryInfo, hasLocation, nextStep: 'other_info' }
}

/**
 * Generate qualification message based on conversation state
 */
function generateQualificationMessage(
  analysis: ReturnType<typeof analyzeConversationState>,
  language: 'en' | 'ar',
  contactName: string
): string {
  const { nextStep, hasService, hasNationality, hasExpiryInfo, hasLocation } = analysis
  
  if (language === 'ar') {
    switch (nextStep) {
      case 'service':
        return `مرحباً ${contactName}، شكراً لتواصلك معنا! 🌟\n\nما هي الخدمة التي تحتاجها؟\n\nمثلاً:\n• تأشيرة عائلية\n• تأشيرة عمل\n• تأسيس شركة\n• تجديد تأشيرة\n\nأخبرني بما تحتاجه وسأساعدك!`
      case 'nationality':
        return `ممتاز! 👍\n\nما هي جنسيتك؟ هذا يساعدني في تقديم المعلومات الصحيحة لك.`
      case 'other_info':
        let otherInfoAr = `شكراً! 📝\n\nللمتابعة، أحتاج بعض المعلومات:\n\n`
        if (!hasExpiryInfo) {
          otherInfoAr += `• متى تنتهي تأشيرتك الحالية؟ (إن وجدت)\n`
        }
        if (!hasLocation) {
          otherInfoAr += `• هل أنت داخل الإمارات أم خارجها؟\n`
        }
        otherInfoAr += `\nهذه المعلومات تساعدنا في تقديم أفضل خدمة لك.`
        return otherInfoAr
      case 'book_call':
        return `ممتاز! لدينا كل المعلومات الأساسية. 🎯\n\nهل تريد حجز مكالمة مع أحد مستشارينا لمناقشة تفاصيل خدمتك؟\n\nأو يمكنك إخباري بأي أسئلة إضافية لديك.`
      default:
        return `مرحباً ${contactName}، كيف يمكنني مساعدتك اليوم؟`
    }
  } else {
    // English
    switch (nextStep) {
      case 'service':
        return `Hi ${contactName}, thanks for reaching out! 🌟\n\nWhat service do you need?\n\nFor example:\n• Family Visa\n• Employment Visa\n• Business Setup\n• Visa Renewal\n\nLet me know what you need and I'll help you!`
      case 'nationality':
        return `Great! 👍\n\nWhat's your nationality? This helps me provide the right information for you.`
      case 'other_info':
        let otherInfoEn = `Thanks! 📝\n\nTo proceed, I need a few details:\n\n`
        if (!hasExpiryInfo) {
          otherInfoEn += `• When does your current visa expire? (if applicable)\n`
        }
        if (!hasLocation) {
          otherInfoEn += `• Are you inside UAE or outside?\n`
        }
        otherInfoEn += `\nThis information helps us provide the best service for you.`
        return otherInfoEn
      case 'book_call':
        return `Perfect! We have all the basic information. 🎯\n\nWould you like to book a call with one of our consultants to discuss your service details?\n\nOr you can let me know if you have any additional questions.`
      default:
        return `Hi ${contactName}, how can I assist you today?`
    }
  }
}

/**
 * Generate AI reply text for automation
 */
export async function generateAIAutoresponse(
  context: AIMessageContext
): Promise<{
  text: string
  success: boolean
  error?: string
  confidence?: number // Phase 4: AI confidence score (0-100)
}> {
  try {
    const { lead, contact, recentMessages = [], mode, channel, language } = context
    const preferredLanguage = language || 'en' // Default to English

    // Handle DOCS mode specially - use docs reminder helper
    if (mode === 'DOCS') {
      try {
        const { generateDocsReminderMessage } = await import('./aiDocsReminder')
        const reminderText = await generateDocsReminderMessage({
          leadId: lead.id,
          channel: channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP',
        })
        return {
          text: reminderText,
          success: true,
        }
      } catch (error: any) {
        console.warn('DOCS mode - failed to generate docs reminder, falling back to draft-reply:', error)
        // Fall through to use draft-reply endpoint
      }
    }

    // Map mode to objective for AI draft endpoint
    const objectiveMap: Record<AIMessageMode, string> = {
      FOLLOW_UP: 'followup',
      QUALIFY: 'qualify',
      RENEWAL: 'renewal',
      PRICING: 'pricing',
      DOCS: 'docs_request',
      REMIND: 'remind',
      BOOK_CALL: 'book_call',
      GENERIC: 'followup',
    }

    const objective = objectiveMap[mode] || 'followup'

    // Get conversation ID
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        channel: channel.toLowerCase(),
        leadId: lead.id,
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      return {
        text: '',
        success: false,
        error: 'No conversation found',
      }
    }

    // Generate structured conversation flow reply
    // Check if this is first message
    const outboundCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
      },
    })
    
    const isFirstMessage = outboundCount === 0
    const contactName = lead.contact?.fullName || contact?.fullName || 'there'
    
    // Detect language from recent messages or use preferred language
    let detectedLanguage = preferredLanguage
    if (!detectedLanguage || detectedLanguage === 'en') {
      const recentInboundMessages = recentMessages
        .filter((m: any) => m.direction === 'INBOUND' || m.direction === 'inbound')
        .map((m: any) => m.body || '')
        .join(' ')
      
      const { detectLanguage: detectLang } = await import('./utils/languageDetection')
      detectedLanguage = detectLang(recentInboundMessages || '')
    }
    console.log(`🌐 Using language for reply: ${detectedLanguage} (preferred: ${preferredLanguage})`)
    
    // Analyze conversation to determine what information is missing
    const conversationAnalysis = analyzeConversationState(lead, contact, recentMessages)
    console.log(`📊 Conversation state for lead ${lead.id}:`, conversationAnalysis)
    
    let draftText = ''
    
    if (isFirstMessage && objective === 'qualify') {
      // First message - always greet with Hamdi introduction (multi-language)
      if (detectedLanguage === 'ar') {
        draftText = `مرحباً! 👋 أهلاً بك في مركز العين للأعمال. اسمي حمدي، كيف يمكنني مساعدتك؟`
      } else {
        draftText = `Hi welcome to alain business center my name is Hamdi, how can i help?`
      }
      console.log(`✅ First message greeting generated for lead ${lead.id} (language: ${detectedLanguage})`)
    } else if (objective === 'qualify') {
      // Structured qualification flow: service → nationality → other info → book call
      draftText = generateQualificationMessage(conversationAnalysis, detectedLanguage, contactName)
      console.log(`✅ Qualification message generated for lead ${lead.id} (step: ${conversationAnalysis.nextStep})`)
    } else {
      // For follow-up messages, use simple template (multi-language)
      switch (objective) {
        case 'qualify':
          if (detectedLanguage === 'ar') {
            draftText = `مرحباً ${contactName}، شكراً لاهتمامك بخدماتنا. لمساعدتك بشكل أفضل، يرجى مشاركة:\n\n1. ما هي الخدمة المحددة التي تبحث عنها؟\n2. ما هو الجدول الزمني الخاص بك؟\n\nنتطلع لمساعدتك!`
          } else {
            draftText = `Hi ${contactName}, thank you for your interest in our services. To better assist you, could you please share:\n\n1. What specific service are you looking for?\n2. What is your timeline?\n\nLooking forward to helping you!`
          }
          break
        case 'followup':
          if (detectedLanguage === 'ar') {
            draftText = `مرحباً ${contactName}، أردت متابعة محادثتنا السابقة. كيف يمكننا مساعدتك أكثر؟ يرجى إعلامي إذا كان لديك أي أسئلة.`
          } else {
            draftText = `Hi ${contactName}, I wanted to follow up on our previous conversation. How can we assist you further? Please let me know if you have any questions.`
          }
          break
        case 'renewal':
          const nearestExpiry = lead.expiryDate
          if (nearestExpiry) {
            const daysUntil = Math.ceil((nearestExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            if (detectedLanguage === 'ar') {
              draftText = `مرحباً ${contactName}، أتمنى أن تكون بخير. لاحظت أن خدمتك ستنتهي خلال ${daysUntil} يوم. هل ترغب في المتابعة مع التجديد؟ يمكننا مساعدتك في إتمام العملية بسلاسة.`
            } else {
              draftText = `Hi ${contactName}, I hope this message finds you well. I noticed that your service is expiring in ${daysUntil} days. Would you like to proceed with renewal? We can help you complete the process smoothly.`
            }
          } else {
            if (detectedLanguage === 'ar') {
              draftText = `مرحباً ${contactName}، أردت التواصل بخصوص تجديداتك القادمة. هل هناك شيء يمكننا مساعدتك فيه؟`
            } else {
              draftText = `Hi ${contactName}, I wanted to check in regarding your upcoming renewals. Is there anything we can help you with?`
            }
          }
          break
        default:
          if (detectedLanguage === 'ar') {
            draftText = `مرحباً ${contactName}، شكراً لتواصلك مع مركز العين للأعمال. كيف يمكنني مساعدتك اليوم؟`
          } else {
            draftText = `Hi ${contactName}, thank you for contacting Al Ain Business Center. How can I assist you today?`
          }
      }
      console.log(`✅ Template reply generated for lead ${lead.id} (objective: ${objective}, language: ${detectedLanguage})`)
    }

    if (!draftText || draftText.trim().length === 0) {
      return {
        text: '',
        success: false,
        error: 'AI returned empty draft',
      }
    }

    // Truncate for WhatsApp (max 1000 chars recommended)
    const maxLength = channel === 'WHATSAPP' ? 1000 : 5000
    const truncatedText = draftText.length > maxLength
      ? draftText.substring(0, maxLength - 3) + '...'
      : draftText

    // Phase 4: Estimate confidence based on message quality and context
    let confidence = 75 // Default confidence
    if (!lead || !lead.serviceType) {
      confidence -= 10 // Lower confidence if lead info missing
    }
    if (recentMessages.length === 0) {
      confidence -= 5 // Lower confidence if no conversation history
    }
    if (truncatedText.length < 50) {
      confidence -= 15 // Lower confidence if message is too short
    }
    if (truncatedText.length > 600) {
      confidence -= 10 // Lower confidence if message is too long
    }
    // Higher confidence if lead is qualified
    if (lead.aiScore && lead.aiScore >= 70) {
      confidence += 10
    }
    
    return {
      text: truncatedText.trim(),
      success: true,
      confidence: Math.max(0, Math.min(100, confidence)), // Clamp between 0-100
    }
  } catch (error: any) {
    console.error('Error generating AI autoresponse:', error)
    return {
      text: '',
      success: false,
      error: error.message || 'Failed to generate AI reply',
      confidence: 0, // No confidence on error
    }
  }
}
