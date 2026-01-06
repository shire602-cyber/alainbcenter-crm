/**
 * Lead Scoring + Next Best Action Engine
 * 
 * Uses existing AI stack (DeepSeek primary, OpenAI fallback) to:
 * 1. Score leads (0-100)
 * 2. Classify as hot/warm/cold
 * 3. Generate next best action recommendation
 * 4. Persist results to Lead fields
 */

import { prisma } from '@/lib/prisma'
import { generateCompletion } from '@/lib/llm'
import type { LLMMessage } from '@/lib/llm/types'

export type ScoringTrigger = 'inbound_message' | 'stage_change' | 'manual'

export interface LeadScoringResult {
  aiScore: number // 0-100
  aiLabel: 'hot' | 'warm' | 'cold'
  summary: string // 1-2 lines
  nextBestAction: {
    type: 'REPLY_NOW' | 'FOLLOW_UP' | 'SEND_TEMPLATE' | 'REQUEST_DOCS' | 'BOOK_CALL' | 'QUALIFY' | 'PROPOSAL'
    title: string
    dueInMinutes: number
    rationale: string
  }
}

/**
 * Score a lead and generate next best action
 */
export async function scoreLead(
  leadId: number,
  trigger: ScoringTrigger
): Promise<LeadScoringResult> {
  // Load lead with related data
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
        },
      },
      serviceType: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Load recent messages (last 20, inbound + outbound)
  const messages = await prisma.message.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      direction: true,
      body: true,
      createdAt: true,
      type: true,
    },
  })

  // Reverse to chronological order (oldest first)
  const chronologicalMessages = messages.reverse()

  // AI config is handled by routing service (DeepSeek first, fallback OpenAI)

  // Build prompt context
  const serviceTypeName = lead.serviceType?.name || lead.serviceTypeEnum || 'Unknown'
  const stage = lead.stage || lead.pipelineStage || 'NEW'
  const lastContactAt = lead.lastContactAt 
    ? new Date(lead.lastContactAt).toISOString() 
    : 'Never'
  
  // Format messages for context
  const messageHistory = chronologicalMessages.map((msg, idx) => {
    const direction = msg.direction === 'INBOUND' || msg.direction === 'IN' ? 'INBOUND' : 'OUTBOUND'
    const timestamp = new Date(msg.createdAt).toISOString()
    const body = (msg.body || '').substring(0, 200) // Truncate long messages
    return `${idx + 1}. [${direction}] ${timestamp}: ${body}`
  }).join('\n')

  // Build system prompt
  const systemPrompt = `You are an expert lead scoring AI for a UAE business center. Your job is to:
1. Score leads from 0-100 based on engagement, intent, and conversion probability
2. Classify as "hot" (70-100), "warm" (40-69), or "cold" (0-39)
3. Recommend the next best action with urgency

Scoring factors:
- Recent engagement (messages, replies)
- Service interest clarity
- Stage progression
- Time since last contact
- Response quality and intent signals

You MUST return valid JSON only. No markdown, no explanations.`

  // Build user prompt
  const userPrompt = `Score this lead and recommend next action:

LEAD INFO:
- ID: ${lead.id}
- Service: ${serviceTypeName}
- Stage: ${stage}
- Last Contact: ${lastContactAt}
- Trigger: ${trigger}

CONTACT INFO:
- Name: ${lead.contact?.fullName || 'Unknown'}
- Nationality: ${lead.contact?.nationality || 'Unknown'}

RECENT MESSAGES (${chronologicalMessages.length} total):
${messageHistory || 'No messages yet'}

Return JSON with this exact structure:
{
  "aiScore": <number 0-100>,
  "aiLabel": "<hot|warm|cold>",
  "summary": "<1-2 line summary of lead status and key factors>",
  "nextBestAction": {
    "type": "<REPLY_NOW|FOLLOW_UP|SEND_TEMPLATE|REQUEST_DOCS|BOOK_CALL|QUALIFY|PROPOSAL>",
    "title": "<short action title>",
    "dueInMinutes": <number of minutes until action should be taken>,
    "rationale": "<why this action is recommended>"
  }
}

CRITICAL: Return ONLY valid JSON. No markdown code blocks, no explanations.`

  // Prepare LLM messages
  const messages_llm: LLMMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ]

  // Generate with JSON response format
  const options = {
    temperature: 0.3, // Lower temperature for more deterministic scoring
    maxTokens: 500,
    topP: 0.9,
    responseFormat: { type: 'json_object' as const }, // Force JSON output
  }

  let rawOutput = ''
  let parseAttempts = 0
  const maxParseAttempts = 2

  while (parseAttempts < maxParseAttempts) {
    try {
      console.log(`[LEAD-SCORING] Generating score for lead ${leadId} (attempt ${parseAttempts + 1}/${maxParseAttempts})`)

      const completionResult = await generateCompletion(
        messages_llm,
        options,
        {
          leadStage: stage,
          conversationLength: chronologicalMessages.length,
          taskType: 'complex', // Scoring is a complex reasoning task
        }
      )

      rawOutput = completionResult.text
      console.log(`[LEAD-SCORING] Raw output (${rawOutput.length} chars): ${rawOutput.substring(0, 200)}...`)

      // Parse JSON output
      let jsonText = rawOutput.trim()
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')
      
      // Try to find JSON object
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonText = jsonMatch[0]
      }

      const parsed = JSON.parse(jsonText) as Partial<LeadScoringResult>

      // Validate and normalize
      if (typeof parsed.aiScore !== 'number' || parsed.aiScore < 0 || parsed.aiScore > 100) {
        throw new Error(`Invalid aiScore: ${parsed.aiScore}. Must be 0-100.`)
      }

      if (!['hot', 'warm', 'cold'].includes(parsed.aiLabel || '')) {
        throw new Error(`Invalid aiLabel: ${parsed.aiLabel}. Must be hot, warm, or cold.`)
      }

      if (!parsed.summary || typeof parsed.summary !== 'string') {
        throw new Error('Missing or invalid summary field')
      }

      if (!parsed.nextBestAction) {
        throw new Error('Missing nextBestAction field')
      }

      const validActionTypes = ['REPLY_NOW', 'FOLLOW_UP', 'SEND_TEMPLATE', 'REQUEST_DOCS', 'BOOK_CALL', 'QUALIFY', 'PROPOSAL']
      if (!validActionTypes.includes(parsed.nextBestAction.type)) {
        throw new Error(`Invalid nextBestAction.type: ${parsed.nextBestAction.type}`)
      }

      // Build final result
      const result: LeadScoringResult = {
        aiScore: Math.round(parsed.aiScore),
        aiLabel: parsed.aiLabel as 'hot' | 'warm' | 'cold',
        summary: parsed.summary.trim(),
        nextBestAction: {
          type: parsed.nextBestAction.type as LeadScoringResult['nextBestAction']['type'],
          title: parsed.nextBestAction.title || 'Action required',
          dueInMinutes: typeof parsed.nextBestAction.dueInMinutes === 'number' 
            ? Math.max(0, parsed.nextBestAction.dueInMinutes) 
            : 1440, // Default 24 hours
          rationale: parsed.nextBestAction.rationale || 'Recommended based on lead scoring',
        },
      }

      console.log(`[LEAD-SCORING] Successfully parsed result:`, {
        aiScore: result.aiScore,
        aiLabel: result.aiLabel,
        nextAction: result.nextBestAction.type,
      })

      return result
    } catch (parseError: any) {
      parseAttempts++
      if (parseAttempts < maxParseAttempts) {
        console.warn(`[LEAD-SCORING] Parse failed: ${parseError.message}, retrying...`)
        // Add stricter JSON instruction
        messages_llm[1].content = userPrompt + '\n\nCRITICAL: You MUST return ONLY valid JSON. No explanations, no markdown, no other text. Just the JSON object.'
      } else {
        console.error(`[LEAD-SCORING] Parse failed after ${maxParseAttempts} attempts:`, parseError.message)
        throw new Error(`Failed to parse AI scoring output: ${parseError.message}`)
      }
    }
  }

  // Should never reach here
  throw new Error('Failed to score lead after all attempts')
}

/**
 * Score a lead and persist results to database
 */
export async function scoreAndPersistLead(
  leadId: number,
  trigger: ScoringTrigger
): Promise<LeadScoringResult> {
  // Generate score
  const result = await scoreLead(leadId, trigger)

  // Prepare update data
  const updateData: any = {
    aiScore: result.aiScore,
    aiNotes: result.summary,
    // Note: forecastProbability doesn't exist in Lead model - use dealProbability if needed
    forecastReasonJson: JSON.stringify([result.nextBestAction.rationale]),
  }

  // Update lead
  await prisma.lead.update({
    where: { id: leadId },
    data: updateData,
  })

  console.log(`[LEAD-SCORING] Persisted scoring results to lead ${leadId}:`, {
    aiScore: result.aiScore,
    aiLabel: result.aiLabel,
  })

  return result
}

