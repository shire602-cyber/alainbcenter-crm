/**
 * Tests for AI Output Schema Parsing and Sanitization
 */

import { parseAIOutput, sanitizeReply, type AIStructuredOutput } from '../outputSchema'

describe('AI Output Schema', () => {
  describe('parseAIOutput', () => {
    it('should parse valid JSON', () => {
      const validJson = JSON.stringify({
        reply: 'Hello, how can I help?',
        service: 'freelance_visa',
        stage: 'qualify',
        needsHuman: false,
        missing: ['nationality'],
        confidence: 0.8,
      })

      const result = parseAIOutput(validJson, [])

      expect(result.structured).not.toBeNull()
      expect(result.structured?.reply).toBe('Hello, how can I help?')
      expect(result.structured?.service).toBe('freelance_visa')
      expect(result.structured?.confidence).toBe(0.8)
    })

    it('should parse JSON wrapped in markdown', () => {
      const markdownJson = '```json\n' + JSON.stringify({
        reply: 'Test reply',
        service: 'family_visa',
        stage: 'qualify',
        needsHuman: false,
        missing: [],
        confidence: 0.7,
      }) + '\n```'

      const result = parseAIOutput(markdownJson, [])

      expect(result.structured).not.toBeNull()
      expect(result.structured?.reply).toBe('Test reply')
    })

    it('should handle missing required fields', () => {
      const invalidJson = JSON.stringify({
        service: 'freelance_visa',
        // Missing "reply" field
      })

      const result = parseAIOutput(invalidJson, [])

      expect(result.structured).toBeNull()
      expect(result.parseError).toContain('reply')
    })

    it('should provide defaults for optional fields', () => {
      const minimalJson = JSON.stringify({
        reply: 'Test reply',
      })

      const result = parseAIOutput(minimalJson, [])

      expect(result.structured).not.toBeNull()
      expect(result.structured?.service).toBe('unknown')
      expect(result.structured?.stage).toBe('qualify')
      expect(result.structured?.needsHuman).toBe(false)
      expect(result.structured?.confidence).toBe(0.5)
    })

    it('should handle parse errors gracefully', () => {
      const invalidJson = '{ invalid json }'

      const result = parseAIOutput(invalidJson, [])

      expect(result.structured).toBeNull()
      expect(result.parseError).toBeDefined()
    })
  })

  describe('sanitizeReply', () => {
    it('should block forbidden patterns', () => {
      const replyWithForbidden = 'Let me check that for you. I will get back to you.'
      const result = sanitizeReply(replyWithForbidden, [])

      expect(result.blocked).toBe(true)
      expect(result.reason).toContain('forbidden pattern')
    })

    it('should block signatures', () => {
      const replyWithSignature = 'Hello! Best regards, Agent'
      const result = sanitizeReply(replyWithSignature, [])

      expect(result.blocked).toBe(true)
    })

    it('should block guarantees', () => {
      const replyWithGuarantee = 'Your visa is guaranteed to be approved'
      const result = sanitizeReply(replyWithGuarantee, [])

      expect(result.blocked).toBe(true)
    })

    it('should allow valid replies', () => {
      const validReply = 'Hi! I can help you with freelance visa. Are you inside or outside UAE?'
      const result = sanitizeReply(validReply, [])

      expect(result.blocked).toBe(false)
      expect(result.sanitized).toBe(validReply)
    })

    it('should block invented dates not in conversation', () => {
      const replyWithInventedDate = 'Your visa expires on 15 March 2026'
      const conversationHistory = [
        { body: 'I need a visa', createdAt: new Date() },
      ]

      const result = sanitizeReply(replyWithInventedDate, conversationHistory)

      expect(result.blocked).toBe(true)
      expect(result.reason).toContain('Invented date')
    })

    it('should allow dates mentioned in conversation', () => {
      const replyWithDate = 'Your visa expires on 15 March 2026'
      const conversationHistory = [
        { body: 'My visa expires on 15 March 2026', createdAt: new Date() },
      ]

      const result = sanitizeReply(replyWithDate, conversationHistory)

      expect(result.blocked).toBe(false)
    })
  })
})

