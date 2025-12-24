/**
 * Prompt Complexity Detection
 * 
 * Analyzes prompts to determine if they require premium LLM (GPT-4o)
 * or can be handled by cheap LLM (Llama 3)
 */

import type { LLMMessage } from './types'

export type ComplexityLevel = 'low' | 'medium' | 'high'

export interface ComplexityAnalysis {
  level: ComplexityLevel
  score: number // 0-100
  factors: string[]
}

/**
 * Analyze prompt complexity
 */
export function analyzeComplexity(
  messages: LLMMessage[],
  context?: {
    leadStage?: string
    conversationLength?: number
    hasMultipleQuestions?: boolean
    requiresReasoning?: boolean
  }
): ComplexityAnalysis {
  const factors: string[] = []
  let score = 0

  // Combine all message content
  const fullText = messages
    .map(m => m.content)
    .join(' ')
    .toLowerCase()

  // Factor 1: Prompt length
  const totalLength = fullText.length
  if (totalLength > 2000) {
    score += 20
    factors.push('long_prompt')
  } else if (totalLength > 1000) {
    score += 10
    factors.push('medium_prompt')
  }

  // Factor 2: Number of questions
  const questionCount = (fullText.match(/\?/g) || []).length
  if (questionCount >= 4) {
    score += 25  // Increased for 4+ questions to ensure medium complexity
    factors.push('multiple_questions')
  } else if (questionCount >= 2) {
    score += 15
    factors.push('multiple_questions')
  }

  // Factor 3: Complex reasoning keywords
  const reasoningKeywords = [
    'analyze', 'analysis', 'analyzing', 'compare', 'comparison', 'evaluate', 'evaluation',
    'explain why', 'reasoning', 'strategy', 'strategic', 'recommend', 'recommendation',
    'optimize', 'optimization', 'calculate', 'determine', 'complex', 'complicated',
    'detailed analysis', 'comprehensive', 'assess', 'assessment', 'detailed evaluation'
  ]
  const reasoningMatches = reasoningKeywords.filter(keyword => fullText.includes(keyword))
  if (reasoningMatches.length > 0) {
    // Multiple reasoning keywords = higher score
    score += 25 + (reasoningMatches.length * 5)
    factors.push('requires_reasoning')
  }

  // Factor 4: Technical/legal language
  const technicalKeywords = [
    'legal', 'compliance', 'regulation', 'regulatory', 'contract', 'agreement',
    'liability', 'jurisdiction', 'tax', 'taxation', 'tax implications', 'audit', 'certification',
    'license', 'licensing', 'permit', 'permission', 'requirement', 'requirements',
    'compliance requirements'
  ]
  const technicalMatches = technicalKeywords.filter(keyword => fullText.includes(keyword))
  if (technicalMatches.length > 0) {
    // Multiple technical keywords = higher score
    score += 20 + (technicalMatches.length * 8)
    factors.push('technical_content')
  }

  // Factor 5: Multi-step tasks
  const stepKeywords = ['first', 'then', 'next', 'finally', 'step 1', 'step 2']
  const hasSteps = stepKeywords.some(keyword => fullText.includes(keyword))
  if (hasSteps) {
    score += 15
    factors.push('multi_step')
  }

  // Factor 6: Context from parameters
  if (context) {
    if (context.conversationLength && context.conversationLength > 10) {
      score += 10
      factors.push('long_conversation')
    }
    if (context.requiresReasoning) {
      score += 20
      factors.push('explicit_reasoning')
    }
    if (context.leadStage === 'CLOSED' || context.leadStage === 'LOST') {
      score += 5
      factors.push('sensitive_stage')
    }
  }

  // Factor 7: Emotional/sensitive content
  const emotionalKeywords = [
    'complaint', 'dissatisfied', 'unhappy', 'refund', 'cancel',
    'urgent', 'emergency', 'critical', 'important', 'asap'
  ]
  const hasEmotional = emotionalKeywords.some(keyword => fullText.includes(keyword))
  if (hasEmotional) {
    score += 15
    factors.push('sensitive_content')
  }

  // Determine complexity level
  let level: ComplexityLevel
  if (score >= 50) {  // Lowered threshold for high complexity
    level = 'high'
  } else if (score >= 25) {  // Lowered threshold for medium complexity
    level = 'medium'
  } else {
    level = 'low'
  }

  return {
    level,
    score: Math.min(100, score),
    factors,
  }
}

/**
 * Check if prompt requires premium LLM
 */
export function requiresPremiumLLM(analysis: ComplexityAnalysis): boolean {
  return analysis.level === 'high' || (analysis.level === 'medium' && analysis.score >= 50)
}

