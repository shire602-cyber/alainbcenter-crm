/**
 * TEMPLATE LIBRARY
 * Single source of truth for all reply templates
 */

import type { Template } from './types'

export const TEMPLATES: Record<string, Template> = {
  greeting_first: {
    text: 'Hi {name}! How can I help you today?',
    textAr: 'مرحباً {name}! كيف يمكنني مساعدتك اليوم؟',
    placeholders: ['name'],
  },
  ask_full_name: {
    text: 'What is your full name?',
    textAr: 'ما هو اسمك الكامل؟',
  },
  ask_service: {
    text: 'How can I help you today?',
    textAr: 'كيف يمكنني مساعدتك اليوم؟',
  },
  ask_nationality: {
    text: 'What is your nationality?',
    textAr: 'ما هي جنسيتك؟',
  },
  business_setup_activity: {
    text: 'What business activity do you need? (e.g., "Marketing License", "Trading", "Consulting")',
    textAr: 'ما هي نشاطك التجاري المطلوب؟ (مثل "رخصة تسويق"، "تجارة"، "استشارات")',
  },
  business_setup_jurisdiction: {
    text: 'Do you need Mainland or Freezone setup?',
    textAr: 'هل تحتاج تأسيس في البر الرئيسي أم المنطقة الحرة؟',
  },
  business_setup_partners: {
    text: 'How many partners/shareholders?',
    textAr: 'كم عدد الشركاء/المساهمين؟',
  },
  business_setup_visas: {
    text: 'How many visas do you need?',
    textAr: 'كم عدد التأشيرات التي تحتاجها؟',
  },
  cheapest_offer_12999: {
    text: 'Great! We offer a complete Business Setup package starting at AED 12,999. This includes license, visa, and all government fees. Would you like to proceed?',
    textAr: 'رائع! نقدم حزمة تأسيس شركة كاملة تبدأ من 12,999 درهم. يشمل الرخصة والتأشيرة وجميع الرسوم الحكومية. هل تريد المتابعة؟',
  },
  handover_call: {
    text: 'Thank you for your interest! One of our consultants will call you shortly to discuss your requirements in detail.',
    textAr: 'شكراً لاهتمامك! سيتم الاتصال بك من قبل أحد مستشارينا قريباً لمناقشة متطلباتك بالتفصيل.',
  },
  followup_day2: {
    text: 'Hi {name}, just following up on your inquiry. How can we help you move forward?',
    textAr: 'مرحباً {name}، أتابع فقط استفسارك. كيف يمكننا مساعدتك للمضي قدماً؟',
    placeholders: ['name'],
  },
  followup_day5: {
    text: 'Hi {name}, we\'re here to help with your {service} needs. Let me know if you have any questions.',
    textAr: 'مرحباً {name}، نحن هنا لمساعدتك في احتياجات {service}. أخبرني إذا كان لديك أي أسئلة.',
    placeholders: ['name', 'service'],
  },
  followup_day12: {
    text: 'Hi {name}, still interested in {service}? We can help you get started today.',
    textAr: 'مرحباً {name}، ما زلت مهتماً بـ {service}؟ يمكننا مساعدتك للبدء اليوم.',
    placeholders: ['name', 'service'],
  },
  followup_day22: {
    text: 'Hi {name}, if you\'re still interested, we\'re here to help. Otherwise, we\'ll mark this as inactive.',
    textAr: 'مرحباً {name}، إذا كنت ما زلت مهتماً، نحن هنا للمساعدة. وإلا، سنقوم بتمييز هذا كغير نشط.',
    placeholders: ['name'],
  },
}

/**
 * Render template with variables
 */
export function renderTemplate(
  templateKey: string,
  variables: Record<string, string> = {}
): string {
  const template = TEMPLATES[templateKey]
  if (!template) {
    console.warn(`[TEMPLATE] Template not found: ${templateKey}`)
    return `[Template ${templateKey} not found]`
  }

  let text = template.text
  if (variables.language === 'ar' && template.textAr) {
    text = template.textAr
  }

  // Replace placeholders
  if (template.placeholders) {
    for (const placeholder of template.placeholders) {
      const value = variables[placeholder] || `{${placeholder}}`
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value)
    }
  }

  return text
}

/**
 * Get template by key
 */
export function getTemplate(templateKey: string): Template | undefined {
  return TEMPLATES[templateKey]
}

