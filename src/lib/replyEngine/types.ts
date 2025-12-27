/**
 * REPLY ENGINE TYPES
 * Core types for the fail-proof reply engine
 */

export type ServiceKey = 
  | 'freelance_visa'
  | 'family_visa'
  | 'visit_visa'
  | 'business_setup'
  | 'golden_visa'
  | 'employment_visa'
  | 'investor_partner_visa'
  | 'domestic_worker_visa'
  | 'emirates_id'
  | 'visa_renewal'
  | 'visa_cancellation'
  | null

export type FSMStage = 
  | 'NEW'
  | 'QUALIFYING'
  | 'QUOTE_READY'
  | 'HANDOVER'
  | 'WON'
  | 'LOST'
  | 'COLD'

export type PlannerAction = 
  | 'ASK'
  | 'INFO'
  | 'OFFER'
  | 'HANDOVER'
  | 'STOP'

export interface FSMState {
  serviceKey: ServiceKey
  stage: FSMStage
  collected: Record<string, any>
  required: string[]
  nextQuestionKey: string | null
  askedQuestionKeys: string[]
  followUpStep: number
  lastInboundMessageId: string | null
  lastOutboundReplyKey: string | null
  stop: {
    enabled: boolean
    reason?: string
  }
}

export interface ExtractedFields {
  serviceKey?: ServiceKey
  nationality?: string
  explicitDate?: Date
  businessActivity?: string
  jurisdiction?: 'mainland' | 'freezone'
  partnersCount?: number
  visasCount?: number
  fullName?: string
}

export interface PlannerPlan {
  action: PlannerAction
  templateKey: string
  questionKey?: string
  updates: Partial<FSMState>
  reason: string
}

export interface ReplyEngineResult {
  text: string
  replyKey: string
  debug: {
    plan: PlannerPlan
    extractedFields: ExtractedFields
    templateKey: string
    skipped: boolean
    reason?: string
  }
}

export interface Template {
  text: string
  textAr?: string
  placeholders?: string[]
}

