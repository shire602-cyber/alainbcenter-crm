import { getAIConfig } from './client'
import { ConversationContext } from './context'
import {
  buildDraftReplyPrompt,
  buildSummaryPrompt,
  buildNextActionsPrompt,
} from './prompts'
import { generateCompletion } from '@/lib/llm'
import type { LLMMessage } from '@/lib/llm/types'

interface DraftReplyResult {
  text: string
  suggestedTags?: string[]
  suggestedNextFollowUpAt?: string
  suggestedStage?: string
}

interface SummaryResult {
  summary: string[]
  missingInfo: string[]
  urgency: 'low' | 'medium' | 'high'
  urgencyReason: string
}

interface NextAction {
  action: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

interface NextActionsResult {
  actions: NextAction[]
}

/**
 * Generate AI draft reply using OpenAI
 */
export async function generateDraftReply(
  context: ConversationContext,
  tone: 'professional' | 'friendly' | 'short',
  language: 'en' | 'ar' = 'en'
): Promise<DraftReplyResult> {
  // Check if any LLM is configured
  const config = await getAIConfig()
  if (!config) {
    throw new Error('AI not configured. Please set GROQ_API_KEY or OPENAI_API_KEY, or configure integrations.')
  }

  const prompt = buildDraftReplyPrompt(context, tone, language)

  try {
    // Use intelligent routing (Llama 3 for simple, GPT-4o for complex)
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant for a UAE business center. Generate WhatsApp messages that are professional, compliant, and effective.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]

    const result = await generateCompletion(messages, {
      temperature: 0.7,
      maxTokens: 300,
    }, {
      leadStage: context.lead?.pipelineStage || context.lead?.status || undefined,
      conversationLength: context.messages?.length,
      hasMultipleQuestions: prompt.includes('?') && (prompt.match(/\?/g) || []).length > 1,
    })

    const text = result.text

    // Extract suggested follow-up date if mentioned (simple heuristic)
    let suggestedNextFollowUpAt: string | undefined
    const followUpMatch = text.match(/follow.?up.*?(\d+)\s*(hours?|days?|weeks?)/i)
    if (followUpMatch) {
      const amount = parseInt(followUpMatch[1])
      const unit = followUpMatch[2].toLowerCase()
      const now = new Date()
      if (unit.includes('hour')) {
        now.setHours(now.getHours() + amount)
      } else if (unit.includes('day')) {
        now.setDate(now.getDate() + amount)
      } else if (unit.includes('week')) {
        now.setDate(now.getDate() + amount * 7)
      }
      suggestedNextFollowUpAt = now.toISOString()
    }

    return {
      text,
      suggestedNextFollowUpAt,
    }
  } catch (error: any) {
    console.error('LLM routing error:', error)
    throw new Error(error.message || 'Failed to generate draft reply')
  }
}

/**
 * Generate conversation summary
 */
export async function generateSummary(
  context: ConversationContext
): Promise<SummaryResult> {
  const config = await getAIConfig()
  if (!config) {
    throw new Error('AI not configured')
  }

  const prompt = buildSummaryPrompt(context)

  try {
    // Note: JSON format may not be supported by all providers, so we'll parse the response
    let apiUrl: string
    let headers: Record<string, string>
    let body: any

    if (config.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Analyze conversations and provide structured summaries in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }
    } else if (config.provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Analyze conversations and provide structured summaries in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }
    } else {
      // Anthropic doesn't support JSON mode, so we'll parse the text response
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: config.model,
        max_tokens: 500,
        system: 'You are a helpful assistant. Analyze conversations and provide structured summaries in JSON format.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error?.message || error.message || 'Failed to generate summary')
    }

    const data = await response.json()
    let content = ''
    
    if (config.provider === 'anthropic') {
      content = data.content?.[0]?.text?.trim() || '{}'
    } else {
      content = data.choices[0]?.message?.content?.trim() || '{}'
    }
    
    const parsed = JSON.parse(content)

    return {
      summary: parsed.summary || [],
      missingInfo: parsed.missingInfo || [],
      urgency: parsed.urgency || 'low',
      urgencyReason: parsed.urgencyReason || '',
    }
  } catch (error: any) {
    console.error(`${config.provider} API error:`, error)
    throw new Error(error.message || 'Failed to generate summary')
  }
}

/**
 * Generate next actions
 */
export async function generateNextActions(
  context: ConversationContext
): Promise<NextActionsResult> {
  const config = await getAIConfig()
  if (!config) {
    throw new Error('AI not configured')
  }

  const prompt = buildNextActionsPrompt(context)

  try {
    let apiUrl: string
    let headers: Record<string, string>
    let body: any

    if (config.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Suggest actionable next steps for sales agents in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }
    } else if (config.provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Suggest actionable next steps for sales agents in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }
    } else {
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: config.model,
        max_tokens: 500,
        system: 'You are a helpful assistant. Suggest actionable next steps for sales agents in JSON format.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error?.message || error.message || 'Failed to generate next actions')
    }

    const data = await response.json()
    let content = ''
    
    if (config.provider === 'anthropic') {
      content = data.content?.[0]?.text?.trim() || '{}'
    } else {
      content = data.choices[0]?.message?.content?.trim() || '{}'
    }
    
    const parsed = JSON.parse(content)

    return {
      actions: parsed.actions || [],
    }
  } catch (error: any) {
    console.error(`${config.provider} API error:`, error)
    throw new Error(error.message || 'Failed to generate next actions')
  }
}
/**
 * Generate mode-specific AI draft (FOLLOW_UP, RENEWAL, DOCS, PRICING)
 */
export async function generateModeSpecificDraft(
  context: ConversationContext,
  mode: 'FOLLOW_UP' | 'RENEWAL' | 'DOCS' | 'PRICING',
  tone: 'professional' | 'friendly' | 'short' = 'friendly',
  language: 'en' | 'ar' = 'en'
): Promise<DraftReplyResult> {
  const config = await getAIConfig()
  if (!config) {
    throw new Error('AI not configured. Please set OpenAI API key in Integrations or OPENAI_API_KEY environment variable.')
  }

  // Import the mode-specific prompt builder
  const { buildModeSpecificDraftPrompt } = await import('./prompts')
  const prompt = buildModeSpecificDraftPrompt(context, mode, tone, language)

  try {
    let apiUrl: string
    let headers: Record<string, string>
    let body: any

    if (config.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for a UAE business center. Generate WhatsApp messages that are professional, compliant, and effective.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }
    } else if (config.provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for a UAE business center. Generate WhatsApp messages that are professional, compliant, and effective.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }
    } else {
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: config.model,
        max_tokens: 300,
        system: 'You are a helpful assistant for a UAE business center. Generate WhatsApp messages that are professional, compliant, and effective.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error?.message || error.message || 'Failed to generate draft')
    }

    const data = await response.json()
    let text = ''
    
    if (config.provider === 'anthropic') {
      text = data.content?.[0]?.text?.trim() || ''
    } else {
      text = data.choices[0]?.message?.content?.trim() || ''
    }

    if (!text) {
      throw new Error('Empty response from AI')
    }

    return {
      text,
    }
  } catch (error: any) {
    console.error(`${config.provider} API error:`, error)
    throw new Error(error.message || 'Failed to generate draft')
  }
}







