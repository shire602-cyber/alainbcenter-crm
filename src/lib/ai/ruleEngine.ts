/**
 * Deterministic Rule Engine for Al Ain Business Center Autopilot
 * 
 * This is the SINGLE SOURCE OF TRUTH for conversation flow.
 * The JSON rule engine defines exact state transitions, memory fields, and guardrails.
 * NO DEVIATIONS ALLOWED.
 */

import { prisma } from '../prisma'

// Rule engine JSON (single source of truth)
const RULE_ENGINE_JSON = {
  "engine": {
    "name": "AlAinBC-Autopilot-RuleEngine",
    "version": "1.0.0",
    "description": "Deterministic conversation router + guardrails for WhatsApp/omnichannel AI (Sales/Support/Follow-up-ready)."
  },
  "global": {
    "channel_policy": {
      "allowed_channels": ["whatsapp", "instagram", "facebook", "webchat"],
      "disallowed_channels": ["email_autoreply"],
      "style": {
        "tone": "friendly_professional",
        "max_questions_per_message": 2,
        "prefer_questions_per_message": 1,
        "single_purpose_message": true,
        "no_internal_reasoning": true,
        "no_generic_stalling": true
      }
    },
    "guardrails": {
      "forbidden_phrases": [
        "guaranteed",
        "guarantee",
        "approval guaranteed",
        "approval assured",
        "100% success",
        "no risk",
        "inside contact",
        "government inside contact",
        "we control approvals",
        "what brings you here",
        "what brings you to uae",
        "what brings you",
        "how can i help you today"
      ],
      "forbidden_behaviors": [
        "explain_chain_of_thought",
        "repeat_same_question_if_answered",
        "ignore_pricing_question",
        "invent_requirements",
        "promise_timelines_unless_allowed",
        "offer_discounts"
      ],
      "timeline_policy": {
        "allow_timelines_only_if_specified": true,
        "allowed_generic_timeline_phrase": "Usually around 2–4 weeks depending on approvals and document readiness."
      },
      "discount_policy": {
        "allow_discounts": false,
        "on_discount_request": {
          "action": "handover_to_human",
          "reason": "Discount requested"
        }
      },
      "fallback_if_confused": {
        "action": "handover_to_human",
        "template": "Thanks for the details, {{name}}. I'm looping in a team member to assist you accurately."
      }
    },
    "memory": {
      "fields": {
        "name": { "type": "string", "required": false },
        "service": { "type": "string", "required": false },
        "nationality": { "type": "string", "required": false },
        "inside_uae": { "type": "boolean", "required": false },
        "timeline_intent": { "type": "string", "required": false },
        "family_location": { "type": "string", "required": false },
        "visit_duration_days": { "type": "integer", "required": false },
        "license_type": { "type": "string", "required": false },
        "business_activity": { "type": "string", "required": false },
        "new_or_renewal": { "type": "string", "required": false },
        "golden_category": { "type": "string", "required": false }
      },
      "rules": {
        "never_reask_if_present": ["name", "service", "nationality", "inside_uae", "visit_duration_days", "license_type", "new_or_renewal"],
        "acknowledge_correction_then_continue": true
      }
    }
  },
  "routing": {
    "service_intents": {
      "family_visa": {
        "keywords": ["family visa", "wife", "husband", "kids", "children", "dependent", "sponsor family"],
        "display_name": "Family Visa"
      },
      "visit_visa": {
        "keywords": ["visit visa", "tourist", "30 days", "60 days", "tourism"],
        "display_name": "Visit Visa"
      },
      "freelance_visa": {
        "keywords": ["freelance visa", "2 year visa", "residence visa freelance"],
        "display_name": "Freelance Visa"
      },
      "freelance_permit": {
        "keywords": ["freelance permit", "permit + visa", "freezone freelance permit"],
        "display_name": "Freelance Permit with Visa"
      },
      "investor_visa": {
        "keywords": ["investor visa", "property investor", "company investor"],
        "display_name": "Investor Visa"
      },
      "pro_services": {
        "keywords": ["pro", "tasheel", "amer", "documents", "typing center", "government processing"],
        "display_name": "PRO Services"
      },
      "business_setup": {
        "keywords": ["business setup", "company formation", "license", "trade license", "freezone", "mainland", "general trading"],
        "display_name": "Business Setup"
      },
      "golden_visa": {
        "keywords": ["golden visa", "10 year visa", "gold visa"],
        "display_name": "Golden Visa"
      }
    }
  },
  "state_machine": {
    "states": [
      {
        "id": "S0_GREETING",
        "entry_conditions": { "is_first_message_in_thread": true },
        "actions": [
          {
            "type": "send_message",
            "template": "Hello! 👋 I'm Hamdi from Al Ain Business Center. I'm here to help with visas and business setup in the UAE."
          }
        ],
        "next": "S1_CAPTURE_NAME"
      },
      {
        "id": "S1_CAPTURE_NAME",
        "entry_conditions": { "memory_missing_any": ["name"] },
        "actions": [
          {
            "type": "ask_question",
            "template": "May I know your full name, please?"
          }
        ],
        "next": "S2_IDENTIFY_SERVICE"
      },
      {
        "id": "S2_IDENTIFY_SERVICE",
        "entry_conditions": { "memory_missing_any": ["service"] },
        "actions": [
          {
            "type": "ask_question",
            "template": "Thanks{{#if name}}, {{name}}{{/if}}. Which service are you looking for today? (Family Visa / Visit Visa / Freelance Visa / Freelance Permit / Business Setup / Golden Visa / PRO Services)"
          }
        ],
        "next": "S3_SERVICE_FLOW"
      },
      {
        "id": "S3_SERVICE_FLOW",
        "entry_conditions": { "memory_has_all": ["service"] },
        "actions": [{ "type": "route_to_service_flow" }],
        "next": "S9_CLOSE_OR_HANDOVER"
      }
    ],
    "service_flows": {
      "Visit Visa": {
        "steps": [
          {
            "id": "VV_Q1_NATIONALITY",
            "when": { "memory_missing_any": ["nationality"] },
            "ask": "What is your nationality?"
          },
          {
            "id": "VV_Q2_DURATION",
            "when": { "memory_missing_any": ["visit_duration_days"] },
            "ask": "Do you need a 30 days or 60 days visit visa?"
          },
          {
            "id": "VV_PRICE",
            "when": { "always": true },
            "respond": {
              "type": "price_quote",
              "pricing_table_ref": "pricing.visit_visa",
              "template": "For {{visit_duration_days}} days visit visa, the price is {{price}}. If you'd like, share the traveler's age and we can proceed with next steps."
            }
          }
        ],
        "handover_rules": [
          {
            "if": { "customer_requested_discount": true },
            "action": "handover_to_human",
            "reason": "Discount request"
          }
        ]
      },
      "Freelance Visa": {
        "steps": [
          {
            "id": "FV_Q1_NATIONALITY",
            "when": { "memory_missing_any": ["nationality"] },
            "ask": "What is your nationality?"
          },
          {
            "id": "FV_Q2_INSIDE_UAE",
            "when": { "memory_missing_any": ["inside_uae"] },
            "ask": "Are you currently inside the UAE?"
          },
          {
            "id": "FV_Q2_INSIDE_UAE_OVERSTAY",
            "when": { "memory_field_equals": { "inside_uae": true } },
            "ask": null, // Skip this question if already answered
          },
          {
            "id": "FV_Q3_PERMIT_OR_VISA",
            "when": { "memory_missing_any": ["service_variant"] },
            "ask": "Do you want visa only (2-year residence), or freelance permit + visa?"
          },
          {
            "id": "FV_PRICE",
            "when": { "always": true },
            "respond": {
              "type": "conditional_price_quote",
              "pricing_table_ref": "pricing.freelance_visa",
              "template": "Based on nationality, the freelance visa price is {{price}}. Key benefits: cost-effective, freedom to work with any company, you can bring family, and you can later upgrade to get your own license. When would you like to get started?"
            }
          }
        ],
        "handover_rules": [
          {
            "if": { "nationality_in": ["nigerian", "bangladeshi"] },
            "action": "handover_to_human",
            "reason": "Restricted nationality flow"
          },
          {
            "if": { "customer_requested_discount": true },
            "action": "handover_to_human",
            "reason": "Discount request"
          }
        ]
      },
      "Freelance Permit with Visa": {
        "steps": [
          {
            "id": "FPV_Q1_NATIONALITY",
            "when": { "memory_missing_any": ["nationality"] },
            "ask": "What is your nationality?"
          },
          {
            "id": "FPV_Q2_INSIDE_UAE",
            "when": { "memory_missing_any": ["inside_uae"] },
            "ask": "Are you currently inside the UAE?"
          },
          {
            "id": "FPV_PRICE",
            "when": { "always": true },
            "respond": {
              "type": "fixed_price_quote",
              "pricing_table_ref": "pricing.freelance_permit",
              "template": "Freelance permit + visa package is AED 11,500. This is best if you want a freezone permit (license) and a visa under it. When would you like to get started?"
            }
          }
        ],
        "handover_rules": [
          {
            "if": { "customer_requested_discount": true },
            "action": "handover_to_human",
            "reason": "Discount request"
          }
        ]
      },
      "Investor Visa": {
        "steps": [
          {
            "id": "IV_Q1_TYPE",
            "when": { "memory_missing_any": ["investor_type"] },
            "ask": "Is this for real estate investment or company/partner investor visa?"
          },
          {
            "id": "IV_Q2_PROPERTY_VALUE",
            "when": { "memory_field_equals": { "investor_type": "real_estate" } },
            "ask": "What's the approximate property value in AED? (Minimum typically starts around AED 750k)"
          },
          {
            "id": "IV_Q3_COMPANY",
            "when": { "memory_field_equals": { "investor_type": "company" } },
            "ask": "Do you already have a UAE company license, or are you planning to set one up?"
          },
          {
            "id": "IV_NEXT",
            "when": { "always": true },
            "respond": {
              "type": "next_step",
              "template": "Thanks{{#if name}}, {{name}}{{/if}}. Share your nationality and when you'd like to start, and a team member will confirm the best investor visa route and exact total cost."
            }
          }
        ]
      },
      "PRO Services": {
        "steps": [
          {
            "id": "PRO_Q1_SCOPE",
            "when": { "memory_missing_any": ["pro_scope"] },
            "ask": "What do you need help with—business setup processing, family visa, employment visa, document clearing, or something else?"
          },
          {
            "id": "PRO_Q2_URGENCY",
            "when": { "memory_missing_any": ["timeline_intent"] },
            "ask": "How urgent is it—ASAP, this week, or flexible?"
          },
          {
            "id": "PRO_NEXT",
            "when": { "always": true },
            "respond": {
              "type": "handover_soft",
              "template": "Understood. We handle the full process while you're at work and coordinate approvals and submissions. I'll share this with our team and they'll confirm the exact scope and pricing."
            }
          }
        ]
      },
      "Business Setup": {
        "steps": [
          {
            "id": "BS_Q1_LICENSE_TYPE",
            "when": { "memory_missing_any": ["license_type"] },
            "ask": "Do you want Freezone or Mainland license?"
          },
          {
            "id": "BS_Q2_ACTIVITY",
            "when": { "memory_missing_any": ["business_activity"] },
            "ask": "What business activity do you need? (e.g., General Trading, Foodstuff Trading, IT Services)"
          },
          {
            "id": "BS_Q3_NEW_OR_RENEWAL",
            "when": { "memory_missing_any": ["new_or_renewal"] },
            "ask": "Is this a new license or renewal?"
          },
          {
            "id": "BS_NEXT",
            "when": { "always": true },
            "respond": {
              "type": "next_step",
              "template": "Perfect. Once I confirm your nationality and when you want to start, our team will share the best option and exact package pricing. Do you want a visa included as well?"
            }
          }
        ]
      },
      "Family Visa": {
        "steps": [
          {
            "id": "FAM_Q1_SPONSOR_STATUS",
            "when": { "memory_missing_any": ["sponsor_status"] },
            "ask": "What type of UAE visa do you currently hold? (Employment / Partner / Investor)"
          },
          {
            "id": "FAM_Q2_FAMILY_LOCATION",
            "when": { "memory_missing_any": ["family_location"] },
            "ask": "Is your family currently inside or outside the UAE?"
          },
          {
            "id": "FAM_Q3_NATIONALITY",
            "when": { "memory_missing_any": ["nationality"] },
            "ask": "What is your family's nationality?"
          },
          {
            "id": "FAM_PRICE_DIRECTION",
            "when": { "always": true },
            "respond": {
              "type": "price_directional",
              "template": "Family visa costs depend on your sponsor visa type and family details. In most cases, the total process usually starts from AED X,XXX (excluding government fees). When would you like to get started so we can give you exact pricing?"
            }
          }
        ]
      },
      "Golden Visa": {
        "steps": [
          {
            "id": "GV_Q1_CATEGORY",
            "when": { "memory_missing_any": ["golden_category"] },
            "ask": "Which Golden Visa category do you believe you qualify under? (Investor / Professional / Media / Student / Executive)"
          },
          {
            "id": "GV_MEDIA_Q1_AUTHORITY",
            "when": { "memory_field_equals": { "golden_category": "Media" } },
            "ask": "Do you already have strong media recognition (awards, major publications, verified work), or are you seeking UAE authority endorsement as part of the process?"
          },
          {
            "id": "GV_MEDIA_Q2_PORTFOLIO",
            "when": { "memory_field_equals": { "golden_category": "Media" } },
            "ask": "Do you have a portfolio of published work or notable achievements we can submit for evaluation?"
          },
          {
            "id": "GV_INVESTOR_Q1_ROUTE",
            "when": { "memory_field_equals": { "golden_category": "Investor" } },
            "ask": "Is your investor route through UAE property or a UAE company?"
          },
          {
            "id": "GV_PROF_Q1_PROFESSION",
            "when": { "memory_field_equals": { "golden_category": "Professional" } },
            "ask": "What is your profession and highest qualification?"
          },
          {
            "id": "GV_INTENT_SOFT",
            "when": { "always": true },
            "ask": "When would you ideally like to get started if you're eligible?"
          },
          {
            "id": "GV_ESCALATE_IF_POSSIBLE",
            "when": { "always": true },
            "respond": {
              "type": "handover_soft",
              "template": "Thanks{{#if name}}, {{name}}{{/if}}. Based on what you shared, we can evaluate your eligibility properly and guide the best route. I'll loop in our specialist to confirm the exact requirements and next steps."
            }
          }
        ],
        "handover_rules": [
          {
            "if": { "customer_declines_to_start": true },
            "action": "stop",
            "reason": "No intent to proceed"
          }
        ]
      }
    }
  },
  "pricing": {
    "visit_visa": {
      "rules": [
        {
          "when": { "nationality_in": ["indian", "india", "philippines", "filipino", "vietnam", "vietnamese", "sri lanka", "srilanka", "sri-lanka"] },
          "prices": { "30": 400, "60": 750 },
          "currency": "AED"
        },
        {
          "when": { "otherwise": true },
          "prices": { "30": 480, "60": 900 },
          "currency": "AED"
        }
      ]
    },
    "freelance_visa": {
      "rules": [
        {
          "when": { "nationality_in": ["indian", "india", "pakistani", "pakistan", "sri lanka", "srilanka", "nepali", "nepal"] },
          "price": 8500,
          "currency": "AED"
        },
        {
          "when": { "otherwise": true },
          "price": 6999,
          "currency": "AED"
        }
      ]
    },
    "freelance_permit": {
      "price": 11500,
      "currency": "AED"
    }
  },
  "handover": {
    "targets": ["human_sales", "human_support", "manager"],
    "conditions": [
      { "if": "customer_requested_discount", "to": "human_sales" },
      { "if": "policy_violation_risk", "to": "manager" },
      { "if": "model_confidence_low", "to": "human_sales" },
      { "if": "missing_required_docs_or_complex_case", "to": "human_support" }
    ],
    "templates": {
      "handover_soft": "Thanks, {{name}}. I'm looping in a team member to help you with accurate pricing and next steps. When is a good time for a quick call or WhatsApp reply?"
    }
  },
  "message_templates": {
    "anti_loop_ack": "Thanks for confirming — noted 👍",
    "no_stalling": "Got it. I can help right away—just need one quick detail:",
    "no_discount": "I understand. Discounts aren't available on this package, but I can have a team member check the best option for you."
  },
  "validation": {
    "pre_send_checks": [
      { "check": "contains_forbidden_phrase", "action": "block_and_rewrite" },
      { "check": "asks_question_already_answered", "action": "remove_question" },
      { "check": "more_than_2_questions", "action": "reduce_questions" },
      { "check": "pricing_question_ignored", "action": "add_price_directional_or_fixed" },
      { "check": "includes_internal_reasoning", "action": "strip_internal_reasoning" }
    ]
  }
}

export interface ConversationMemory {
  name?: string
  service?: string
  nationality?: string
  inside_uae?: boolean
  timeline_intent?: string
  family_location?: string
  visit_duration_days?: number
  license_type?: string // 'freezone' | 'mainland'
  business_activity?: string
  new_or_renewal?: string
  golden_category?: string
  sponsor_status?: string
  investor_type?: string
  service_variant?: string
  pro_scope?: string
  [key: string]: any
}

export interface RuleEngineContext {
  conversationId: number
  leadId: number
  contactId: number
  currentMessage: string
  conversationHistory: Array<{ direction: string; body: string; createdAt: Date }>
  isFirstMessage: boolean
  memory: ConversationMemory
}

export interface RuleEngineResult {
  reply: string
  needsHuman: boolean
  handoverReason?: string
  memoryUpdates: Partial<ConversationMemory>
  nextState?: string
  service?: string
}

/**
 * Extract information from current message and update memory
 */
function extractAndUpdateMemory(
  message: string,
  currentMemory: ConversationMemory,
  conversationHistory: Array<{ direction: string; body: string }>
): Partial<ConversationMemory> {
  const updates: Partial<ConversationMemory> = {}
  const lowerMessage = message.toLowerCase()
  const allText = conversationHistory.map(m => m.body || '').join(' ').toLowerCase()
  
  // Extract name
  if (!currentMemory.name) {
    const namePatterns = [
      /(?:my name is|i'm|i am|name is|call me|it's|its|name:|i said|just said)\s+([a-z\s]{2,50})/i,
      /^([a-z\s]{2,50})$/i,
    ]
    for (const pattern of namePatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        const potentialName = match[1].trim()
        if (potentialName.length >= 2 && potentialName.length <= 50 && 
            !['hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'freezone', 'mainland'].includes(potentialName.toLowerCase())) {
          updates.name = potentialName
          break
        }
      }
    }
  }
  
  // Extract service - check both current message and conversation history
  if (!currentMemory.service) {
    const serviceIntents = RULE_ENGINE_JSON.routing.service_intents
    // Check current message first (highest priority)
    for (const [key, intent] of Object.entries(serviceIntents)) {
      for (const keyword of intent.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          updates.service = intent.display_name
          break
        }
      }
      if (updates.service) break
    }
    // If not found in current message, check conversation history
    if (!updates.service) {
      for (const [key, intent] of Object.entries(serviceIntents)) {
        for (const keyword of intent.keywords) {
          if (allText.includes(keyword.toLowerCase())) {
            updates.service = intent.display_name
            break
          }
        }
        if (updates.service) break
      }
    }
  }
  
  // Extract nationality
  if (!currentMemory.nationality) {
    const nationalityKeywords = [
      { pattern: /nigerian|nigeria/i, value: 'nigerian' },
      { pattern: /bangladeshi|bangladesh/i, value: 'bangladeshi' },
      { pattern: /somali|somalia/i, value: 'somali' },
      { pattern: /indian|india/i, value: 'indian' },
      { pattern: /pakistani|pakistan/i, value: 'pakistani' },
      { pattern: /filipino|philippines/i, value: 'filipino' },
      { pattern: /egyptian|egypt/i, value: 'egyptian' },
      { pattern: /british|uk|united kingdom/i, value: 'british' },
      { pattern: /american|usa|united states/i, value: 'american' },
      { pattern: /canadian|canada/i, value: 'canadian' },
      { pattern: /nepali|nepal/i, value: 'nepali' },
      { pattern: /sri lankan|sri lanka|srilanka/i, value: 'sri lankan' },
      { pattern: /vietnamese|vietnam/i, value: 'vietnamese' },
    ]
    for (const { pattern, value } of nationalityKeywords) {
      if (pattern.test(allText)) {
        updates.nationality = value
        break
      }
    }
  }
  
  // Extract inside_uae - improved patterns
  if (currentMemory.inside_uae === undefined) {
    // Positive indicators (inside UAE)
    if (lowerMessage.includes('inside') || 
        lowerMessage.includes('in uae') || 
        lowerMessage.includes('im inside') ||
        lowerMessage === 'yes' ||
        lowerMessage === 'yea' ||
        lowerMessage === 'yep' ||
        lowerMessage === 'yup' ||
        lowerMessage.includes('already') && (lowerMessage.includes('overstay') || lowerMessage.includes('here') || lowerMessage.includes('uae')) ||
        lowerMessage.includes('currently in') ||
        lowerMessage.includes('i am in') ||
        lowerMessage.includes('im in')) {
      updates.inside_uae = true
    } 
    // Negative indicators (outside UAE)
    else if (lowerMessage.includes('outside') || 
             lowerMessage.includes('outside uae') || 
             lowerMessage.includes('im outside') ||
             lowerMessage === 'no' ||
             lowerMessage.includes('not in uae') ||
             lowerMessage.includes('not inside')) {
      updates.inside_uae = false
    }
    // Check conversation history for context
    else {
      // If user said "already overstay" or similar, they're inside
      if (allText.includes('overstay') || allText.includes('already here') || allText.includes('currently in uae')) {
        updates.inside_uae = true
      }
    }
  }
  
  // Extract license_type (for business setup)
  if (!currentMemory.license_type) {
    if (lowerMessage.includes('mainland')) {
      updates.license_type = 'mainland'
    } else if (lowerMessage.includes('freezone') || lowerMessage.includes('free zone')) {
      updates.license_type = 'freezone'
    }
  }
  
  // Extract business_activity
  if (!currentMemory.business_activity) {
    const activityKeywords = ['general trading', 'foodstuff', 'it services', 'consulting', 'trading', 'import export']
    for (const keyword of activityKeywords) {
      if (lowerMessage.includes(keyword)) {
        updates.business_activity = keyword
        break
      }
    }
  }
  
  // Extract visit_duration_days
  if (!currentMemory.visit_duration_days) {
    if (lowerMessage.includes('30') || lowerMessage.includes('thirty')) {
      updates.visit_duration_days = 30
    } else if (lowerMessage.includes('60') || lowerMessage.includes('sixty')) {
      updates.visit_duration_days = 60
    }
  }
  
  // Extract service_variant (for freelance visa: visa vs permit)
  if (!currentMemory.service_variant && currentMemory.service === 'Freelance Visa') {
    if (lowerMessage.includes('visa only') || lowerMessage.includes('just visa') || lowerMessage.includes('only visa')) {
      updates.service_variant = 'visa'
    } else if (lowerMessage.includes('permit') || lowerMessage.includes('permit + visa') || lowerMessage.includes('permit and visa')) {
      updates.service_variant = 'permit'
    }
  }
  
  // Extract discount request
  if (lowerMessage.includes('discount') || lowerMessage.includes('cheaper') || lowerMessage.includes('lower price')) {
    updates.customer_requested_discount = true
  }
  
  return updates
}

/**
 * Check if condition is met
 */
function checkCondition(condition: any, memory: ConversationMemory, context: RuleEngineContext): boolean {
  if (condition.memory_missing_any) {
    const fields = Array.isArray(condition.memory_missing_any) ? condition.memory_missing_any : [condition.memory_missing_any]
    return fields.some((field: string) => !memory[field])
  }
  
  if (condition.memory_has_all) {
    const fields = Array.isArray(condition.memory_has_all) ? condition.memory_has_all : [condition.memory_has_all]
    return fields.every((field: string) => !!memory[field])
  }
  
  if (condition.memory_field_equals) {
    const [field, value] = Object.entries(condition.memory_field_equals)[0]
    return memory[field as keyof ConversationMemory] === value
  }
  
  if (condition.nationality_in) {
    const nationalities = Array.isArray(condition.nationality_in) ? condition.nationality_in : [condition.nationality_in]
    const memoryNationality = memory.nationality?.toLowerCase() || ''
    return nationalities.some((nat: string) => {
      const natLower = nat.toLowerCase()
      return memoryNationality === natLower || memoryNationality.includes(natLower) || natLower.includes(memoryNationality)
    })
  }
  
  if (condition.is_first_message_in_thread) {
    return context.isFirstMessage
  }
  
  if (condition.always) {
    return true
  }
  
  if (condition.customer_requested_discount) {
    return memory.customer_requested_discount === true
  }
  
  return false
}

/**
 * Get pricing based on service and memory
 */
function getPricing(service: string, memory: ConversationMemory): number | null {
  if (service === 'Visit Visa') {
    const pricing = RULE_ENGINE_JSON.pricing.visit_visa
    const duration = memory.visit_duration_days || 30
    const durationKey = duration.toString() as '30' | '60'
    
    for (const rule of pricing.rules) {
      if (rule.when.nationality_in && memory.nationality) {
        const nationalities = Array.isArray(rule.when.nationality_in) ? rule.when.nationality_in : [rule.when.nationality_in]
        if (nationalities.some((nat: string) => memory.nationality?.toLowerCase().includes(nat.toLowerCase()))) {
          return (rule.prices as Record<string, number>)[durationKey] || null
        }
      } else if (rule.when.otherwise) {
        return (rule.prices as Record<string, number>)[durationKey] || null
      }
    }
  }
  
  if (service === 'Freelance Visa') {
    const pricing = RULE_ENGINE_JSON.pricing.freelance_visa
    for (const rule of pricing.rules) {
      if (rule.when.nationality_in && memory.nationality) {
        const nationalities = Array.isArray(rule.when.nationality_in) ? rule.when.nationality_in : [rule.when.nationality_in]
        if (nationalities.some(nat => memory.nationality?.toLowerCase().includes(nat.toLowerCase()))) {
          return rule.price
        }
      } else if (rule.when.otherwise) {
        return rule.price
      }
    }
  }
  
  if (service === 'Freelance Permit with Visa') {
    return RULE_ENGINE_JSON.pricing.freelance_permit.price
  }
  
  return null
}

/**
 * Render template with memory variables
 */
function renderTemplate(template: string, memory: ConversationMemory, price?: number): string {
  let rendered = template
  
  // Replace {{name}}
  if (memory.name) {
    rendered = rendered.replace(/\{\{#if name\}\}([^]*?)\{\{\/if\}\}/g, (match, content) => {
      return content.replace(/\{\{name\}\}/g, memory.name || '')
    })
    rendered = rendered.replace(/\{\{name\}\}/g, memory.name)
  } else {
    rendered = rendered.replace(/\{\{#if name\}\}([^]*?)\{\{\/if\}\}/g, '')
    rendered = rendered.replace(/\{\{name\}\}/g, '')
  }
  
  // Replace {{price}}
  if (price !== undefined) {
    rendered = rendered.replace(/\{\{price\}\}/g, `AED ${price}`)
  }
  
  // Replace {{visit_duration_days}}
  if (memory.visit_duration_days) {
    rendered = rendered.replace(/\{\{visit_duration_days\}\}/g, memory.visit_duration_days.toString())
  }
  
  // Clean up any remaining template syntax
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, '')
  
  return rendered.trim()
}

/**
 * Validate reply against guardrails
 */
function validateReply(reply: string, memory: ConversationMemory, context: RuleEngineContext): {
  valid: boolean
  sanitized?: string
  blocked: boolean
  reason?: string
} {
  const lowerReply = reply.toLowerCase()
  
  // Check forbidden phrases
  for (const phrase of RULE_ENGINE_JSON.global.guardrails.forbidden_phrases) {
    if (lowerReply.includes(phrase.toLowerCase())) {
      return {
        valid: false,
        blocked: true,
        reason: `Contains forbidden phrase: ${phrase}`
      }
    }
  }
  
  // Check for internal reasoning
  const reasoningPatterns = [/i should/i, /i will/i, /let me/i, /i think/i, /i believe/i]
  for (const pattern of reasoningPatterns) {
    if (pattern.test(reply)) {
      return {
        valid: false,
        blocked: true,
        reason: 'Contains internal reasoning'
      }
    }
  }
  
  // Check question count
  const questionCount = (reply.match(/\?/g) || []).length
  if (questionCount > RULE_ENGINE_JSON.global.channel_policy.style.max_questions_per_message) {
    // Reduce to max questions
    const sentences = reply.split(/(?<=[.!?])\s+/)
    const questions = sentences.filter(s => s.includes('?'))
    const nonQuestions = sentences.filter(s => !s.includes('?'))
    const reducedQuestions = questions.slice(0, RULE_ENGINE_JSON.global.channel_policy.style.max_questions_per_message)
    const sanitized = [...nonQuestions, ...reducedQuestions].join(' ')
    return {
      valid: false,
      sanitized,
      blocked: false,
      reason: 'Too many questions, reduced'
    }
  }
  
  return { valid: true, blocked: false }
}

/**
 * Load memory from conversation
 */
export async function loadConversationMemory(conversationId: number): Promise<ConversationMemory> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    }) as any
    
    if (conversation?.ruleEngineMemory) {
      try {
        return JSON.parse(conversation.ruleEngineMemory) as ConversationMemory
      } catch {
        return {}
      }
    }
  } catch (error) {
    console.error('Failed to load conversation memory:', error)
  }
  return {}
}

/**
 * Execute rule engine - MAIN FUNCTION
 */
export async function executeRuleEngine(context: RuleEngineContext): Promise<RuleEngineResult> {
  // Step 1: Extract information from current message
  const memoryUpdates = extractAndUpdateMemory(
    context.currentMessage,
    context.memory,
    context.conversationHistory
  )
  
  // Merge updates into memory
  const updatedMemory: ConversationMemory = {
    ...context.memory,
    ...memoryUpdates
  }
  
  // Step 2: Determine current state
  let currentState = 'S0_GREETING'
  
  // Check if we've sent greeting
  const hasGreeting = context.conversationHistory.some(m => 
    m.direction === 'OUTBOUND' && 
    (m.body || '').toLowerCase().includes('hello') && 
    (m.body || '').toLowerCase().includes('hamdi')
  )
  
  if (hasGreeting) {
    currentState = 'S1_CAPTURE_NAME'
  }
  
  // Check if we have name
  if (updatedMemory.name) {
    currentState = 'S2_IDENTIFY_SERVICE'
  }
  
  // Check if we have service
  if (updatedMemory.service) {
    currentState = 'S3_SERVICE_FLOW'
  }
  
  // Step 3: Execute state actions
  let reply = ''
  let needsHuman = false
  let handoverReason = ''
  
  const states = RULE_ENGINE_JSON.state_machine.states
  const currentStateDef = states.find(s => s.id === currentState)
  
  if (currentState === 'S0_GREETING' && context.isFirstMessage) {
    const action = currentStateDef?.actions[0] as any
    if (action?.type === 'send_message' && action?.template) {
      reply = renderTemplate(action.template, updatedMemory)
    }
  } else if (currentState === 'S1_CAPTURE_NAME' && !updatedMemory.name) {
    const action = currentStateDef?.actions[0] as any
    if (action?.type === 'ask_question' && action?.template) {
      reply = renderTemplate(action.template, updatedMemory)
    }
  } else if (currentState === 'S2_IDENTIFY_SERVICE' && !updatedMemory.service) {
    const action = currentStateDef?.actions[0] as any
    if (action?.type === 'ask_question' && action?.template) {
      reply = renderTemplate(action.template, updatedMemory)
    }
  } else if (currentState === 'S3_SERVICE_FLOW' && updatedMemory.service) {
    // Route to service-specific flow
    const serviceFlow = RULE_ENGINE_JSON.state_machine.service_flows[updatedMemory.service as keyof typeof RULE_ENGINE_JSON.state_machine.service_flows]
    
    if (serviceFlow) {
      // Check handover rules first
      const handoverRules = (serviceFlow as any).handover_rules || []
      for (const handoverRule of handoverRules) {
        if (checkCondition(handoverRule.if, updatedMemory, context)) {
          needsHuman = true
          handoverReason = handoverRule.reason || 'Complex case'
          reply = RULE_ENGINE_JSON.handover.templates.handover_soft
          reply = renderTemplate(reply, updatedMemory)
          return {
            reply,
            needsHuman: true,
            handoverReason,
            memoryUpdates,
            service: updatedMemory.service
          }
        }
      }
      
      // Execute service flow steps
      for (const step of serviceFlow.steps) {
        if (checkCondition(step.when, updatedMemory, context)) {
          if (step.ask) {
            reply = renderTemplate(step.ask, updatedMemory)
            break
          } else if (step.respond) {
            if (step.respond.type === 'price_quote' || step.respond.type === 'conditional_price_quote' || step.respond.type === 'fixed_price_quote') {
              const price = getPricing(updatedMemory.service, updatedMemory)
              reply = renderTemplate(step.respond.template, updatedMemory, price || undefined)
            } else if (step.respond.type === 'price_directional') {
              reply = renderTemplate(step.respond.template, updatedMemory)
            } else if (step.respond.type === 'next_step' || step.respond.type === 'handover_soft') {
              reply = renderTemplate(step.respond.template, updatedMemory)
              if (step.respond.type === 'handover_soft') {
                needsHuman = true
                handoverReason = 'Service-specific handover'
              }
            }
            break
          }
        }
      }
    }
  }
  
  // Step 4: Validate reply
  const validation = validateReply(reply, updatedMemory, context)
  if (!validation.valid) {
    if (validation.blocked) {
      // Use fallback
      reply = RULE_ENGINE_JSON.global.guardrails.fallback_if_confused.template
      reply = renderTemplate(reply, updatedMemory)
      needsHuman = true
      handoverReason = validation.reason || 'Reply blocked by validation'
    } else if (validation.sanitized) {
      reply = validation.sanitized
    }
  }
  
  // Step 5: Check for discount request
  if (updatedMemory.customer_requested_discount) {
    needsHuman = true
    handoverReason = 'Discount requested'
    reply = RULE_ENGINE_JSON.message_templates.no_discount
    reply = renderTemplate(reply, updatedMemory)
  }
  
  // Step 6: Persist memory to database
  if (Object.keys(memoryUpdates).length > 0) {
    try {
      // Store memory in conversation ruleEngineMemory field
      await (prisma.conversation.update as any)({
        where: { id: context.conversationId },
        data: {
          ruleEngineMemory: JSON.stringify(updatedMemory),
          // Also update lockedService if service was identified
          ...(updatedMemory.service && { lockedService: updatedMemory.service.toLowerCase().replace(/\s+/g, '_') }),
        }
      })
      console.log(`💾 [RULE-ENGINE] Persisted memory updates:`, Object.keys(memoryUpdates))
    } catch (error) {
      console.error('❌ [RULE-ENGINE] Failed to persist memory:', error)
    }
  }
  
  return {
    reply,
    needsHuman,
    handoverReason,
    memoryUpdates,
    service: updatedMemory.service
  }
}

