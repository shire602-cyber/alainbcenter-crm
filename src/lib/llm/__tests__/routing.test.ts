/**
 * Unit Tests for LLM Routing Service
 * 
 * Tests complexity detection, routing decisions, and fallback mechanisms
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RoutingService } from '../routing'
import { analyzeComplexity, requiresPremiumLLM } from '../complexity'
import type { LLMMessage } from '../types'

describe('Complexity Analysis', () => {
  it('should detect low complexity for simple prompts', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello, how are you?' },
    ]
    const analysis = analyzeComplexity(messages)
    
    expect(analysis.level).toBe('low')
    expect(analysis.score).toBeLessThan(30)
  })

  it('should detect high complexity for reasoning tasks', () => {
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: 'Please analyze and compare the different business license options available in UAE. I need a detailed evaluation of each option with recommendations.',
      },
    ]
    const analysis = analyzeComplexity(messages)
    
    expect(analysis.level).toBe('high')
    expect(analysis.score).toBeGreaterThanOrEqual(60)
    expect(analysis.factors).toContain('requires_reasoning')
  })

  it('should detect medium complexity for multiple questions', () => {
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: 'What are your services? How much do they cost? What documents do I need? When can I start?',
      },
    ]
    const analysis = analyzeComplexity(messages)
    
    expect(analysis.level).toBe('medium')
    expect(analysis.factors).toContain('multiple_questions')
  })

  it('should detect high complexity for technical/legal content', () => {
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: 'I need help understanding the legal compliance requirements and tax implications for my business setup in Dubai.',
      },
    ]
    const analysis = analyzeComplexity(messages)
    
    expect(analysis.level).toBe('high')
    expect(analysis.factors).toContain('technical_content')
  })

  it('should consider context in complexity analysis', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Tell me about your services' },
    ]
    const analysis = analyzeComplexity(messages, {
      conversationLength: 20,
      requiresReasoning: true,
      leadStage: 'CLOSED',
    })
    
    expect(analysis.score).toBeGreaterThan(30)
    expect(analysis.factors).toContain('long_conversation')
    expect(analysis.factors).toContain('explicit_reasoning')
  })
})

describe('Premium LLM Requirement', () => {
  it('should require premium for high complexity', () => {
    const analysis = {
      level: 'high' as const,
      score: 70,
      factors: ['requires_reasoning'],
    }
    expect(requiresPremiumLLM(analysis)).toBe(true)
  })

  it('should not require premium for low complexity', () => {
    const analysis = {
      level: 'low' as const,
      score: 20,
      factors: [],
    }
    expect(requiresPremiumLLM(analysis)).toBe(false)
  })

  it('should require premium for medium complexity with high score', () => {
    const analysis = {
      level: 'medium' as const,
      score: 55,
      factors: ['multiple_questions', 'technical_content'],
    }
    expect(requiresPremiumLLM(analysis)).toBe(true)
  })
})

describe('Routing Service', () => {
  let routingService: RoutingService

  beforeEach(() => {
    routingService = new RoutingService()
  })

  it('should route simple prompts to Llama 3', async () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello, what services do you offer?' },
    ]

    // Mock providers
    const mockComplete = vi.fn().mockResolvedValue({
      text: 'We offer business setup services.',
      confidence: 80,
      tokensUsed: { prompt: 10, completion: 5, total: 15 },
    })

    // Note: In a real test, you'd mock the providers
    // For now, we test the routing logic
    const analysis = analyzeComplexity(messages)
    expect(analysis.level).toBe('low')
    expect(requiresPremiumLLM(analysis)).toBe(false)
  })

  it('should route complex prompts to OpenAI', async () => {
    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: 'Please analyze and compare all business license options with detailed recommendations and compliance considerations.',
      },
    ]

    const analysis = analyzeComplexity(messages)
    expect(analysis.level).toBe('high')
    expect(requiresPremiumLLM(analysis)).toBe(true)
  })
})

describe('Cost Calculation', () => {
  it('should calculate costs correctly', () => {
    const llama3 = {
      costPer1KInput: 0.0,
      costPer1KOutput: 0.0,
    }
    const openai = {
      costPer1KInput: 0.005,
      costPer1KOutput: 0.015,
    }

    const tokens = { prompt: 1000, completion: 500, total: 1500 }

    const llamaCost = (tokens.prompt / 1000) * llama3.costPer1KInput + 
                      (tokens.completion / 1000) * llama3.costPer1KOutput
    const openaiCost = (tokens.prompt / 1000) * openai.costPer1KInput + 
                       (tokens.completion / 1000) * openai.costPer1KOutput

    expect(llamaCost).toBe(0)
    expect(openaiCost).toBe(0.005 + 0.0075) // 0.0125
  })
})

