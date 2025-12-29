/**
 * Tests for global greeting prefix (context-aware, non-repetitive)
 */

import { describe, it, expect } from 'vitest'
import { withGlobalGreeting, hasGlobalGreeting, hasOldQuestionText } from '../globalGreeting'

const FULL_GREETING = "Hi 👋 I'm ABCai from Al Ain Business Center.\n\n"

describe('Global Greeting (Context-Aware)', () => {
  describe('withGlobalGreeting - First Message', () => {
    it('should prepend FULL_GREETING to first outbound message', () => {
      const message = 'To help quickly, may I know your full name, service needed, and nationality?'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: true,
        conversationId: 1,
      })
      
      expect(result).toContain(FULL_GREETING.trim())
      expect(result).toContain(message)
      expect(result).not.toContain('How can I help you today')
    })

    it('should NOT duplicate greeting if message already starts with it', () => {
      const message = FULL_GREETING + 'May I know your name?'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: true,
        conversationId: 1,
      })
      
      // Should only have greeting once
      const greetingCount = (result.match(new RegExp(FULL_GREETING.trim(), 'g')) || []).length
      expect(greetingCount).toBe(1)
    })

    it('should handle empty message on first outbound', () => {
      const result = withGlobalGreeting('', {
        isFirstOutboundMessage: true,
        conversationId: 1,
      })
      expect(result).toContain(FULL_GREETING.trim())
    })
  })

  describe('withGlobalGreeting - Subsequent Messages', () => {
    it('should NOT prepend greeting to second outbound message', () => {
      const message = 'Perfect, Abdi! ✅ I\'ve noted:\n• Service: Business Setup\n• Nationality: China'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: false,
        conversationId: 1,
      })
      
      expect(result).not.toContain(FULL_GREETING.trim())
      expect(result).toBe(message)
    })

    it('should NOT add greeting to mid-flow confirmation message', () => {
      const message = 'Please share your email so I can send you the quotation.'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: false,
        conversationId: 1,
      })
      
      expect(result).toBe(message)
      expect(result).not.toContain(FULL_GREETING.trim())
    })

    it('should NOT add greeting to handoff message', () => {
      const message = 'Perfect ✅ I have enough to proceed.\nPlease share your email for the quotation.'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: false,
        conversationId: 1,
      })
      
      expect(result).toBe(message)
      expect(result).not.toContain(FULL_GREETING.trim())
    })
  })

  describe('hasGlobalGreeting', () => {
    it('should return true if message starts with FULL_GREETING', () => {
      const message = FULL_GREETING + 'Some content'
      expect(hasGlobalGreeting(message)).toBe(true)
    })

    it('should return false if message does not start with greeting', () => {
      const message = 'Some content without greeting'
      expect(hasGlobalGreeting(message)).toBe(false)
    })

    it('should handle trimmed messages', () => {
      const message = '   ' + FULL_GREETING.trim() + '   '
      expect(hasGlobalGreeting(message)).toBe(true)
    })
  })

  describe('hasOldQuestionText', () => {
    it('should detect old question text', () => {
      const message = "Hi 👋 I'm ABCai, from Al Ain Business Center. How can I help you today?"
      expect(hasOldQuestionText(message)).toBe(true)
    })

    it('should return false for new greeting without question', () => {
      const message = FULL_GREETING + 'Some content'
      expect(hasOldQuestionText(message)).toBe(false)
    })

    it('should be case-insensitive', () => {
      const message = 'HOW CAN I HELP YOU TODAY?'
      expect(hasOldQuestionText(message)).toBe(true)
    })
  })

  describe('Greeting Content', () => {
    it('should NOT include "How can I help you today?" in greeting', () => {
      const message = 'To help quickly, may I know your full name?'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: true,
        conversationId: 1,
      })
      
      expect(result).not.toContain('How can I help you today')
      expect(result).not.toContain('how can i help you today')
    })

    it('should use correct greeting format', () => {
      const message = 'Test message'
      const result = withGlobalGreeting(message, {
        isFirstOutboundMessage: true,
        conversationId: 1,
      })
      
      expect(result).toContain("Hi 👋 I'm ABCai from Al Ain Business Center.")
      expect(result).not.toContain('ABCai, from') // Should be "ABCai from" (no comma)
    })
  })
})

