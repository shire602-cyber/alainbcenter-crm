/**
 * PLANNER (Rules-based decision engine)
 * Determines next action based on FSM state and inbound message
 */

import type { FSMState, PlannerPlan, PlannerAction, ServiceKey } from './types'
import { wasQuestionAsked } from './fsm'

/**
 * Plan next action based on state and inbound text
 */
export function planNextAction(
  state: FSMState,
  inboundText: string,
  extractedFields: Record<string, any>
): PlannerPlan {
  const lowerText = inboundText.toLowerCase()

  // Rule 1: If stop enabled, STOP
  if (state.stop.enabled) {
    return {
      action: 'STOP',
      templateKey: 'handover_call',
      updates: {},
      reason: `Stop enabled: ${state.stop.reason || 'Unknown'}`,
    }
  }

  // Rule 2: If serviceKey missing, ASK service
  if (!state.serviceKey) {
    // Check if extracted fields have service
    const extractedService = extractedFields.serviceKey
    if (extractedService) {
      return {
        action: 'ASK',
        templateKey: 'ask_full_name',
        questionKey: 'full_name',
        updates: {
          serviceKey: extractedService,
          stage: 'QUALIFYING',
          required: getRequiredFieldsForService(extractedService),
        },
        reason: `Service detected: ${extractedService}, now asking for name`,
      }
    }

    return {
      action: 'ASK',
      templateKey: 'ask_service',
      questionKey: 'service',
      updates: {
        stage: 'NEW',
      },
      reason: 'Service not detected, asking for service',
    }
  }

  // Rule 3: Business setup flow (max 5 questions)
  if (state.serviceKey === 'business_setup') {
    return planBusinessSetupAction(state, lowerText, extractedFields)
  }

  // Rule 4: Other services (3-5 question scripts)
  return planGenericServiceAction(state, lowerText, extractedFields)
}

/**
 * Plan action for business setup flow
 */
function planBusinessSetupAction(
  state: FSMState,
  lowerText: string,
  extractedFields: Record<string, any>
): PlannerPlan {
  const collected = state.collected
  const askedCount = state.askedQuestionKeys.length

  // Check for cheapest/budget request -> OFFER
  if (lowerText.includes('cheapest') || lowerText.includes('budget') || lowerText.includes('lowest price')) {
    return {
      action: 'OFFER',
      templateKey: 'cheapest_offer_12999',
      updates: {
        followUpStep: state.followUpStep + 1,
      },
      reason: 'User requested cheapest option, showing offer',
    }
  }

  // Question 1: Full name (if not collected)
  if (!collected.fullName && !wasQuestionAsked(state, 'full_name')) {
    if (extractedFields.fullName) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_activity',
        questionKey: 'business_activity',
        updates: {
          collected: { fullName: extractedFields.fullName },
          askedQuestionKeys: ['full_name'],
        },
        reason: 'Name extracted, moving to activity question',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'ask_full_name',
      questionKey: 'full_name',
      updates: {
        askedQuestionKeys: ['full_name'],
      },
      reason: 'Asking for full name (question 1/5)',
    }
  }

  // Question 2: Business activity (if not collected)
  if (!collected.businessActivity && !wasQuestionAsked(state, 'business_activity')) {
    if (extractedFields.businessActivity) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_jurisdiction',
        questionKey: 'jurisdiction',
        updates: {
          collected: { businessActivity: extractedFields.businessActivity },
          askedQuestionKeys: ['business_activity'],
        },
        reason: 'Activity extracted, moving to jurisdiction question',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_activity',
      questionKey: 'business_activity',
      updates: {
        askedQuestionKeys: ['business_activity'],
      },
      reason: 'Asking for business activity (question 2/5)',
    }
  }

  // Question 3: Jurisdiction (if not collected)
  if (!collected.jurisdiction && !wasQuestionAsked(state, 'jurisdiction')) {
    if (extractedFields.jurisdiction) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_partners',
        questionKey: 'partners_count',
        updates: {
          collected: { jurisdiction: extractedFields.jurisdiction },
          askedQuestionKeys: ['jurisdiction'],
        },
        reason: 'Jurisdiction extracted, moving to partners question',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_jurisdiction',
      questionKey: 'jurisdiction',
      updates: {
        askedQuestionKeys: ['jurisdiction'],
      },
      reason: 'Asking for jurisdiction (question 3/5)',
    }
  }

  // Question 4: Partners count (if not collected)
  if (collected.partnersCount === undefined && !wasQuestionAsked(state, 'partners_count')) {
    if (extractedFields.partnersCount !== undefined) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_visas',
        questionKey: 'visas_count',
        updates: {
          collected: { partnersCount: extractedFields.partnersCount },
          askedQuestionKeys: ['partners_count'],
        },
        reason: 'Partners count extracted, moving to visas question',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_partners',
      questionKey: 'partners_count',
      updates: {
        askedQuestionKeys: ['partners_count'],
      },
      reason: 'Asking for partners count (question 4/5)',
    }
  }

  // Question 5: Visas count (if not collected)
  if (collected.visasCount === undefined && !wasQuestionAsked(state, 'visas_count')) {
    if (extractedFields.visasCount !== undefined) {
      return {
        action: 'INFO',
        templateKey: 'handover_call',
        updates: {
          collected: { visasCount: extractedFields.visasCount },
          askedQuestionKeys: ['visas_count'],
          stage: 'QUOTE_READY',
        },
        reason: 'All questions answered, ready for quote',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_visas',
      questionKey: 'visas_count',
      updates: {
        askedQuestionKeys: ['visas_count'],
      },
      reason: 'Asking for visas count (question 5/5)',
    }
  }

  // All questions answered
  if (askedCount >= 5 || (collected.fullName && collected.businessActivity && collected.jurisdiction && collected.partnersCount !== undefined && collected.visasCount !== undefined)) {
    return {
      action: 'HANDOVER',
      templateKey: 'handover_call',
      updates: {
        stage: 'QUOTE_READY',
      },
      reason: 'All business setup questions answered, ready for handover',
    }
  }

  // Fallback: continue with next missing field
  return {
    action: 'HANDOVER',
    templateKey: 'handover_call',
    updates: {},
    reason: 'Business setup flow complete',
  }
}

/**
 * Plan action for generic services (freelance, family, visit, etc.)
 */
function planGenericServiceAction(
  state: FSMState,
  lowerText: string,
  extractedFields: Record<string, any>
): PlannerPlan {
  const collected = state.collected
  const required = state.required.length > 0 ? state.required : getRequiredFieldsForService(state.serviceKey!)

  // Check required fields in order
  for (const field of required) {
    if (!collected[field] && !wasQuestionAsked(state, field)) {
      const templateKey = getTemplateKeyForField(field)
      return {
        action: 'ASK',
        templateKey,
        questionKey: field,
        updates: {
          askedQuestionKeys: [field],
        },
        reason: `Asking for required field: ${field}`,
      }
    }
  }

  // All required fields collected
  return {
    action: 'HANDOVER',
    templateKey: 'handover_call',
    updates: {
      stage: 'QUOTE_READY',
    },
    reason: 'All required fields collected, ready for handover',
  }
}

/**
 * Get required fields for a service
 */
function getRequiredFieldsForService(serviceKey: ServiceKey): string[] {
  switch (serviceKey) {
    case 'freelance_visa':
      return ['fullName', 'nationality']
    case 'family_visa':
      return ['fullName', 'nationality']
    case 'visit_visa':
      return ['fullName', 'nationality']
    case 'golden_visa':
      return ['fullName', 'nationality']
    default:
      return ['fullName', 'nationality']
  }
}

/**
 * Get template key for a field
 */
function getTemplateKeyForField(field: string): string {
  switch (field) {
    case 'fullName':
      return 'ask_full_name'
    case 'nationality':
      return 'ask_nationality'
    default:
      return 'ask_full_name'
  }
}

