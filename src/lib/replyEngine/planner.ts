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
  extractedFields: Record<string, any>,
  isFirstMessage: boolean = false
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

  // Rule 2: If serviceKey missing, ASK service (after greeting)
  if (!state.serviceKey) {
    // Check if extracted fields have service
    const extractedService = extractedFields.serviceKey
    if (extractedService) {
      // CRITICAL: Check if we already asked for name AND if name is already collected
      const nameAlreadyAsked = wasQuestionAsked(state, 'full_name')
      const nameAlreadyCollected = !!state.collected.fullName
      
      if (nameAlreadyAsked || nameAlreadyCollected) {
        // Name already asked or collected, check nationality
        const nationalityAlreadyAsked = wasQuestionAsked(state, 'nationality')
        const nationalityAlreadyCollected = !!state.collected.nationality
        
        if (nationalityAlreadyAsked || nationalityAlreadyCollected) {
          // Both name and nationality collected, handover
          return {
            action: 'HANDOVER',
            templateKey: 'handover_call',
            updates: {
              serviceKey: extractedService,
              stage: 'QUOTE_READY',
              required: getRequiredFieldsForService(extractedService),
            },
            reason: `Service detected: ${extractedService}, name and nationality already collected, ready for handover`,
          }
        }
        // Name collected but nationality missing, ask nationality
        return {
          action: 'ASK',
          templateKey: 'ask_nationality',
          questionKey: 'nationality',
          updates: {
            serviceKey: extractedService,
            stage: 'QUALIFYING',
            required: getRequiredFieldsForService(extractedService),
          },
          reason: `Service detected: ${extractedService}, name already collected, asking nationality (Q2)`,
        }
      }
      // Name not asked or collected, ask name
      return {
        action: 'ASK',
        templateKey: 'ask_full_name',
        questionKey: 'full_name',
        updates: {
          serviceKey: extractedService,
          stage: 'QUALIFYING',
          required: getRequiredFieldsForService(extractedService),
        },
        reason: `Service detected: ${extractedService}, now asking for name (Q1)`,
      }
    }

    // CRITICAL: Check if we already asked for service to prevent duplicates
    if (wasQuestionAsked(state, 'service')) {
      // Service already asked but not detected, check if we have name
      const nameAlreadyAsked = wasQuestionAsked(state, 'full_name')
      const nameAlreadyCollected = !!state.collected.fullName
      
      if (nameAlreadyAsked || nameAlreadyCollected) {
        // Name already asked/collected, ask nationality or handover
        const nationalityAlreadyAsked = wasQuestionAsked(state, 'nationality')
        const nationalityAlreadyCollected = !!state.collected.nationality
        
        if (nationalityAlreadyAsked || nationalityAlreadyCollected) {
          return {
            action: 'HANDOVER',
            templateKey: 'handover_call',
            updates: {
              stage: 'QUOTE_READY',
            },
            reason: 'Service already asked, name and nationality collected, ready for handover',
          }
        }
        return {
          action: 'ASK',
          templateKey: 'ask_nationality',
          questionKey: 'nationality',
          updates: {
            stage: 'NEW',
          },
          reason: 'Service already asked, name collected, asking nationality (Q2)',
        }
      }
      // Service asked but name not collected, ask name
      return {
        action: 'ASK',
        templateKey: 'ask_full_name',
        questionKey: 'full_name',
        updates: {
          stage: 'NEW',
        },
        reason: 'Service already asked, asking for name (Q1)',
      }
    }

    return {
      action: 'ASK',
      templateKey: 'ask_service',
      questionKey: 'service',
      updates: {
        stage: 'NEW',
      },
      reason: 'Service not detected, asking for service (Q1)',
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

  // PERFECT ORDER - Q1: Full name (always first, question 1/5)
  // CRITICAL: Double-check we haven't asked this before to prevent duplicates
  const nameAlreadyAsked = wasQuestionAsked(state, 'full_name')
  if (!collected.fullName && !nameAlreadyAsked) {
    if (extractedFields.fullName) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_activity',
        questionKey: 'business_activity',
        updates: {
          collected: { fullName: extractedFields.fullName },
          askedQuestionKeys: ['full_name'],
        },
        reason: 'Name extracted (Q1), asking business activity (Q2/5)',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'ask_full_name',
      questionKey: 'full_name',
      updates: {
        askedQuestionKeys: ['full_name'],
      },
      reason: 'Asking for full name (Q1/5)',
    }
  }
  
  // If name was already asked but not collected, skip to next question
  if (nameAlreadyAsked && !collected.fullName) {
    // Name was asked but not provided, move to next question
    if (!collected.businessActivity && !wasQuestionAsked(state, 'business_activity')) {
      return {
        action: 'ASK',
        templateKey: 'business_setup_activity',
        questionKey: 'business_activity',
        updates: {},
        reason: 'Name already asked (Q1), asking business activity (Q2/5)',
      }
    }
  }

  // PERFECT ORDER - Q2: Business activity (question 2/5)
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
        reason: 'Activity extracted (Q2), asking jurisdiction (Q3/5)',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_activity',
      questionKey: 'business_activity',
      updates: {
        askedQuestionKeys: ['business_activity'],
      },
      reason: 'Asking for business activity (Q2/5)',
    }
  }

  // PERFECT ORDER - Q3: Jurisdiction (question 3/5)
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
        reason: 'Jurisdiction extracted (Q3), asking partners (Q4/5)',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_jurisdiction',
      questionKey: 'jurisdiction',
      updates: {
        askedQuestionKeys: ['jurisdiction'],
      },
      reason: 'Asking for jurisdiction (Q3/5)',
    }
  }

  // PERFECT ORDER - Q4: Partners count (question 4/5)
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
        reason: 'Partners count extracted (Q4), asking visas (Q5/5)',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_partners',
      questionKey: 'partners_count',
      updates: {
        askedQuestionKeys: ['partners_count'],
      },
      reason: 'Asking for partners count (Q4/5)',
    }
  }

  // PERFECT ORDER - Q5: Visas count (question 5/5 - FINAL)
  if (collected.visasCount === undefined && !wasQuestionAsked(state, 'visas_count')) {
    if (extractedFields.visasCount !== undefined) {
      return {
        action: 'HANDOVER',
        templateKey: 'handover_call',
        updates: {
          collected: { visasCount: extractedFields.visasCount },
          askedQuestionKeys: ['visas_count'],
          stage: 'QUOTE_READY',
        },
        reason: 'All 5 questions answered, ready for handover',
      }
    }
    return {
      action: 'ASK',
      templateKey: 'business_setup_visas',
      questionKey: 'visas_count',
      updates: {
        askedQuestionKeys: ['visas_count'],
      },
      reason: 'Asking for visas count (Q5/5 - FINAL)',
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
    // CRITICAL: Map field name to questionKey (e.g., 'fullName' -> 'full_name')
    const questionKey = getQuestionKeyForField(field)
    const alreadyAsked = wasQuestionAsked(state, questionKey)
    
    if (!collected[field] && !alreadyAsked) {
      const templateKey = getTemplateKeyForField(field)
      return {
        action: 'ASK',
        templateKey,
        questionKey: questionKey, // Use mapped questionKey
        updates: {
          askedQuestionKeys: [questionKey], // Use mapped questionKey
        },
        reason: `Asking for required field: ${field} (Q${state.askedQuestionKeys.length + 1}/5)`,
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
 * Get question key for a field (maps field name to questionKey used in askedQuestionKeys)
 * CRITICAL: This must match the format used in askedQuestionKeys (e.g., 'full_name' not 'fullName')
 */
function getQuestionKeyForField(field: string): string {
  switch (field) {
    case 'fullName':
      return 'full_name' // CRITICAL: Must match what's stored in askedQuestionKeys
    case 'nationality':
      return 'nationality'
    default:
      // Convert camelCase to snake_case
      return field.replace(/([A-Z])/g, '_$1').toLowerCase()
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

