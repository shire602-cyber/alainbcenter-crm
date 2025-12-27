/**
 * LLM GATEWAY (Optional with strict validation)
 * Passes template through LLM for personalization, with strict validation
 */

import type { Template } from './types'
import { renderTemplate } from './templates'
import { validateAIReply, sanitizeReplyText } from './validation'

const FORBIDDEN_PHRASES = [
  'guaranteed',
  'approval guaranteed',
  '100%',
  'inside contact',
  'government connection',
  'as an ai',
  'as an artificial intelligence',
  'i will now',
  'system prompt',
  'i cannot',
  'i can\'t',
]

/**
 * Validate LLM output
 */
export function validateLLMOutput(text: string): {
  isValid: boolean
  error?: string
  sanitized?: string
} {
  // Check for forbidden phrases
  const lowerText = text.toLowerCase()
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lowerText.includes(phrase)) {
      return {
        isValid: false,
        error: `Contains forbidden phrase: ${phrase}`,
        sanitized: undefined,
      }
    }
  }

  // Check for multiple question marks (max 1)
  const questionCount = (text.match(/\?/g) || []).length
  if (questionCount > 1) {
    return {
      isValid: false,
      error: `Contains ${questionCount} questions (max 1 allowed)`,
      sanitized: undefined,
    }
  }

  // Check for meta AI wording
  const metaPatterns = [
    /as an ai/i,
    /as an artificial intelligence/i,
    /i will now/i,
    /system prompt/i,
  ]
  for (const pattern of metaPatterns) {
    if (pattern.test(text)) {
      return {
        isValid: false,
        error: 'Contains meta AI wording',
        sanitized: undefined,
      }
    }
  }

  return { isValid: true }
}

/**
 * Pass template through LLM (optional enhancement)
 * Returns original template if LLM fails or output is invalid
 */
export async function enhanceWithLLM(
  templateKey: string,
  template: Template,
  variables: Record<string, string>,
  conversationContext?: string
): Promise<string> {
  // For now, return rendered template without LLM enhancement
  // This can be enhanced later with actual LLM calls
  // The key requirement is: if LLM fails or output is invalid, return original template

  try {
    // TODO: Add actual LLM call here if needed
    // const llmResult = await callLLM(...)
    // const validated = validateLLMOutput(llmResult)
    // if (validated.isValid) {
    //   return llmResult
    // }

    // For now, just return rendered template
    return renderTemplate(templateKey, variables)
  } catch (error) {
    console.warn(`[LLM-GATEWAY] LLM enhancement failed, using template:`, error)
    return renderTemplate(templateKey, variables)
  }
}

/**
 * Get final text (with optional LLM enhancement)
 */
export async function getFinalText(
  templateKey: string,
  template: Template,
  variables: Record<string, string>,
  useLLM: boolean = false
): Promise<string> {
  if (!useLLM) {
    return renderTemplate(templateKey, variables)
  }

  // Try LLM enhancement
  const enhanced = await enhanceWithLLM(templateKey, template, variables)
  const validated = validateLLMOutput(enhanced)

  if (validated.isValid) {
    return enhanced
  }

  // Fallback to original template
  console.warn(`[LLM-GATEWAY] LLM output invalid (${validated.error}), using template`)
  return renderTemplate(templateKey, variables)
}

