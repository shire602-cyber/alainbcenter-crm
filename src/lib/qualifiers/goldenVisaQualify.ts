/**
 * GOLDEN VISA QUALIFIER (STRICT, LOW-HALLUCINATION)
 * 
 * Non-negotiable rules:
 * - Never say "guaranteed", "approval guaranteed", "100%", "inside contact", "government connection"
 * - Do not invent categories or requirements - only use policy JSON
 * - Max 1 clarifying question per reply
 * - Max 4 questions total
 * - Don't reject harshly: if "maybe" -> keep polite + request one missing proof item, or offer alternative
 */

import { prisma } from '../prisma'
import goldenVisaPolicy from '../policies/goldenVisaPolicy.json'

export interface GoldenVisaQualification {
  categoryKey: string | null
  answers: Record<string, any>
  proofStatus: 'yes' | 'partly' | 'no' | null
  likelyEligible: boolean
  startTimeline: 'ASAP' | 'this week' | 'this month' | 'later' | null
  questionsAsked: number
  nextQuestion: string | null
  shouldEscalate: boolean
  handoverReason: string | null
}

export interface GoldenVisaSettings {
  minPropertyValueAED: number
  minSalaryAED: number
  minCompanyRevenueAED: number
  minGPA: number
  requireDegreeAttestation: boolean
  requireBankNOCForMortgage: boolean
}

/**
 * Load Golden Visa settings from database
 * Falls back to defaults if not configured
 */
async function loadGoldenVisaSettings(): Promise<GoldenVisaSettings> {
  try {
    // Try to get from Integration table (using config field)
    const integration = await prisma.integration.findUnique({
      where: { name: 'golden_visa_settings' },
    })

    if (integration?.config) {
      return JSON.parse(integration.config)
    }
  } catch (error) {
    console.warn('Failed to load Golden Visa settings, using defaults:', error)
  }

  // Default thresholds (admin should configure these)
  return {
    minPropertyValueAED: 2000000, // 2M AED
    minSalaryAED: 30000, // 30K AED/month
    minCompanyRevenueAED: 1000000, // 1M AED
    minGPA: 3.5,
    requireDegreeAttestation: true,
    requireBankNOCForMortgage: true,
  }
}

/**
 * Detect Golden Visa intent from message text
 */
export function detectGoldenVisaIntent(text: string): boolean {
  const lower = text.toLowerCase()
  const keywords = ['golden visa', '10 year visa', 'gold visa', 'golden', '10-year visa']
  return keywords.some((keyword) => lower.includes(keyword))
}

/**
 * Get current qualification state from lead
 */
function getCurrentQualificationState(lead: any): GoldenVisaQualification | null {
  if (!lead.dataJson) {
    return null
  }

  try {
    const data = JSON.parse(lead.dataJson)
    return data.goldenVisa || null
  } catch {
    return null
  }
}

/**
 * Evaluate likely eligibility based on answers and category
 */
async function evaluateLikelyEligible(
  categoryKey: string,
  answers: Record<string, any>,
  settings: GoldenVisaSettings
): Promise<boolean> {
  const category = goldenVisaPolicy.categories.find((c) => c.key === categoryKey)
  if (!category) {
    return false
  }

  // Evaluate based on category rules
  switch (categoryKey) {
    case 'real_estate_investor':
      const value = parseFloat(answers.propertyValue || '0')
      return value >= settings.minPropertyValueAED

    case 'professional':
      const salary = parseFloat(answers.salary || '0')
      return salary >= settings.minSalaryAED

    case 'entrepreneur':
      return answers.companyOwner === 'UAE' && (answers.docsStatus === 'yes' || answers.docsStatus === 'partly')

    case 'talent_media':
    case 'scientist':
      return answers.proofStatus === 'yes' || answers.proofStatus === 'partly'

    case 'outstanding_student':
      const gpa = parseFloat(answers.gpa || '0')
      return gpa >= settings.minGPA && (answers.docsStatus === 'yes' || answers.docsStatus === 'partly')

    default:
      return false
  }
}

/**
 * Generate next question based on current state
 */
function generateNextQuestion(
  qualification: GoldenVisaQualification,
  category: any
): string | null {
  const questionsAsked = qualification.questionsAsked || 0

  if (questionsAsked >= 4) {
    return null // Max questions reached
  }

  // Q1: Category (if not set)
  if (!qualification.categoryKey) {
    return goldenVisaPolicy.commonQuestions.q1_category
  }

  // Q2: Category-specific question
  if (questionsAsked === 1 && category) {
    // Get category-specific question (skip Q1 which is category)
    const categoryQuestions = category.questions.filter((q: string) => !q.includes('Which Golden Visa category'))
    return categoryQuestions[0] || null
  }

  // Q3: Documents ready
  if (questionsAsked === 2 && !qualification.proofStatus) {
    return goldenVisaPolicy.commonQuestions.q3_documents
  }

  // Q4: Timeline
  if (questionsAsked === 3 && !qualification.startTimeline) {
    return goldenVisaPolicy.commonQuestions.q4_timeline
  }

  return null
}

/**
 * Parse answer from message text
 */
function parseAnswer(question: string, answerText: string, categoryKey: string | null): any {
  const lower = answerText.toLowerCase()

  // Parse category
  if (question.includes('Which Golden Visa category')) {
    const categoryMap: Record<string, string> = {
      investor: 'real_estate_investor',
      professional: 'professional',
      entrepreneur: 'entrepreneur',
      student: 'outstanding_student',
      talent: 'talent_media',
      media: 'talent_media',
      scientist: 'scientist',
    }

    for (const [key, value] of Object.entries(categoryMap)) {
      if (lower.includes(key)) {
        return { categoryKey: value }
      }
    }
    return { categoryKey: 'other' }
  }

  // Parse documents status
  if (question.includes('documents ready') || question.includes('proof')) {
    if (lower.includes('yes') || lower.includes('ready') || lower.includes('have')) {
      return { proofStatus: 'yes' }
    }
    if (lower.includes('partly') || lower.includes('maybe') || lower.includes('some')) {
      return { proofStatus: 'partly' }
    }
    if (lower.includes('no') || lower.includes('not') || lower.includes("don't")) {
      return { proofStatus: 'no' }
    }
  }

  // Parse timeline
  if (question.includes('get started') || question.includes('timeline')) {
    if (lower.includes('asap') || lower.includes('now') || lower.includes('immediately')) {
      return { startTimeline: 'ASAP' }
    }
    if (lower.includes('this week') || lower.includes('week')) {
      return { startTimeline: 'this week' }
    }
    if (lower.includes('this month') || lower.includes('month')) {
      return { startTimeline: 'this month' }
    }
    if (lower.includes('later') || lower.includes('not sure')) {
      return { startTimeline: 'later' }
    }
  }

  // Parse category-specific answers
  if (categoryKey === 'real_estate_investor') {
    // Extract property value
    const valueMatch = answerText.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:aed|dirhams?|dhs?)/i)
    if (valueMatch) {
      const value = parseFloat(valueMatch[1].replace(/,/g, ''))
      return { propertyValue: value }
    }

    // Check if mortgaged
    if (lower.includes('mortgage') || lower.includes('loan')) {
      return { isMortgaged: true }
    }
    if (lower.includes('paid') || lower.includes('fully')) {
      return { isMortgaged: false }
    }
  }

  if (categoryKey === 'professional') {
    // Extract salary
    const salaryMatch = answerText.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:aed|dirhams?|dhs?)/i)
    if (salaryMatch) {
      const salary = parseFloat(salaryMatch[1].replace(/,/g, ''))
      return { salary: salary }
    }

    // Extract job title
    const jobTitleMatch = answerText.match(/(?:i am|i'm|job title|position|work as|profession)[:\s]+([^,\.]+)/i)
    if (jobTitleMatch) {
      return { jobTitle: jobTitleMatch[1].trim() }
    }
  }

  if (categoryKey === 'entrepreneur') {
    if (lower.includes('uae') && (lower.includes('company') || lower.includes('business'))) {
      return { companyOwner: 'UAE' }
    }
    if (lower.includes('outside') || lower.includes('other country')) {
      return { companyOwner: 'outside UAE' }
    }
  }

  if (categoryKey === 'outstanding_student') {
    // Extract GPA
    const gpaMatch = answerText.match(/gpa[:\s]+(\d+\.?\d*)/i) || answerText.match(/(\d+\.?\d*)\s*(?:gpa|grade)/i)
    if (gpaMatch) {
      return { gpa: parseFloat(gpaMatch[1]) }
    }
  }

  return {}
}

/**
 * Main qualification function
 */
export async function goldenVisaQualify(
  leadId: number,
  conversationId: number,
  messageText: string,
  lastQuestion?: string | null
): Promise<{
  qualification: GoldenVisaQualification
  replyText: string | null
  shouldEscalate: boolean
  taskTitle?: string
  alertMessage?: string
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        where: { id: conversationId },
      },
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  const settings = await loadGoldenVisaSettings()
  let qualification = getCurrentQualificationState(lead) || {
    categoryKey: null,
    answers: {},
    proofStatus: null,
    likelyEligible: false,
    startTimeline: null,
    questionsAsked: 0,
    nextQuestion: null,
    shouldEscalate: false,
    handoverReason: null,
  }

  // If we have a last question, parse the answer
  if (lastQuestion && messageText) {
    const parsedAnswer = parseAnswer(lastQuestion, messageText, qualification.categoryKey)
    
    // Update qualification with parsed answer
    if (parsedAnswer.categoryKey) {
      qualification.categoryKey = parsedAnswer.categoryKey
    }
    if (parsedAnswer.proofStatus) {
      qualification.proofStatus = parsedAnswer.proofStatus
    }
    if (parsedAnswer.startTimeline) {
      qualification.startTimeline = parsedAnswer.startTimeline
    }
    
    // Merge other answers
    qualification.answers = { ...qualification.answers, ...parsedAnswer }
    qualification.questionsAsked = (qualification.questionsAsked || 0) + 1
  }

  // Get category
  const category = qualification.categoryKey
    ? goldenVisaPolicy.categories.find((c) => c.key === qualification.categoryKey)
    : null

  // Evaluate eligibility
  if (qualification.categoryKey && qualification.questionsAsked >= 2) {
    qualification.likelyEligible = await evaluateLikelyEligible(
      qualification.categoryKey,
      qualification.answers,
      settings
    )
  }

  // Generate next question
  qualification.nextQuestion = generateNextQuestion(qualification, category)

  // Determine escalation
  qualification.shouldEscalate =
    qualification.likelyEligible &&
    qualification.startTimeline !== null &&
    qualification.startTimeline !== 'later'

  if (qualification.shouldEscalate) {
    qualification.handoverReason = `Likely eligible for ${category?.label || 'Golden Visa'} and wants to start ${qualification.startTimeline}`
  }

  // Generate reply text
  let replyText: string | null = null

  if (qualification.questionsAsked >= 4) {
    // Max questions reached
    if (qualification.likelyEligible && qualification.shouldEscalate) {
      replyText = `Thank you for the information. Based on what you've shared, you may be eligible for Golden Visa under the ${category?.label || ''} category. Our team will review your case and contact you shortly to discuss next steps.`
    } else {
      // Not eligible or timeline is "later"
      replyText = `Thank you for the information. Eligibility for Golden Visa depends on meeting specific criteria for your chosen category. `
      
      // Offer alternatives
      const alternatives = goldenVisaPolicy.globalRules.offerAlternatives
      if (alternatives.length > 0) {
        replyText += `We can also help you explore other options such as ${alternatives.join(', ')}. Would you like to learn more about these alternatives?`
      }
    }
  } else if (qualification.nextQuestion) {
    // Ask next question
    replyText = qualification.nextQuestion
  } else if (!qualification.categoryKey) {
    // First question
    replyText = goldenVisaPolicy.commonQuestions.q1_category
  }

  // Check for forbidden phrases (safety check)
  if (replyText) {
    for (const phrase of goldenVisaPolicy.globalRules.forbiddenPhrases) {
      if (replyText.toLowerCase().includes(phrase)) {
        console.error(`❌ [GOLDEN-VISA] Forbidden phrase detected: "${phrase}"`)
        replyText = replyText.replace(new RegExp(phrase, 'gi'), '')
      }
    }
  }

  // Save qualification state
  const existingData = lead.dataJson ? JSON.parse(lead.dataJson) : {}
  existingData.goldenVisa = qualification

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      dataJson: JSON.stringify(existingData),
    },
  })

  return {
    qualification,
    replyText,
    shouldEscalate: qualification.shouldEscalate,
    taskTitle: qualification.shouldEscalate
      ? 'Golden Visa Consultation + Document Verification'
      : undefined,
    alertMessage: qualification.shouldEscalate
      ? `Likely qualified Golden Visa lead (${category?.label || 'Unknown category'})`
      : undefined,
  }
}

