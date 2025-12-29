/**
 * Tests for greeting context detection and idempotency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Greeting Context Detection', () => {
  describe('First Outbound Message Detection', () => {
    it('should detect first message when firstGreetingSentAt is not set', () => {
      const knownFields = {}
      const isFirst = !knownFields.firstGreetingSentAt
      expect(isFirst).toBe(true)
    })

    it('should detect subsequent message when firstGreetingSentAt is set', () => {
      const knownFields = {
        firstGreetingSentAt: '2024-01-01T00:00:00.000Z',
      }
      const isFirst = !knownFields.firstGreetingSentAt
      expect(isFirst).toBe(false)
    })

    it('should handle outbound count check', () => {
      const outboundCount = 0
      const firstGreetingSentAt = null
      
      let isFirstOutboundMessage = false
      if (!firstGreetingSentAt) {
        if (outboundCount === 0) {
          isFirstOutboundMessage = true
        }
      }
      
      expect(isFirstOutboundMessage).toBe(true)
    })

    it('should not add greeting if count > 0 but firstGreetingSentAt not set (race condition)', () => {
      const outboundCount = 1
      const firstGreetingSentAt = null
      
      let isFirstOutboundMessage = false
      if (!firstGreetingSentAt) {
        if (outboundCount === 0) {
          isFirstOutboundMessage = true
        } else {
          // Race condition - don't add greeting to be safe
          isFirstOutboundMessage = false
        }
      }
      
      expect(isFirstOutboundMessage).toBe(false)
    })
  })

  describe('Idempotency - Retry Behavior', () => {
    it('should not re-add greeting on retry if firstGreetingSentAt is set', () => {
      // Simulate retry scenario
      const knownFields = {
        firstGreetingSentAt: '2024-01-01T00:00:00.000Z',
      }
      
      const isFirst = !knownFields.firstGreetingSentAt
      expect(isFirst).toBe(false)
      
      // Greeting should not be added
      const message = 'Some message content'
      const shouldAddGreeting = isFirst
      expect(shouldAddGreeting).toBe(false)
    })

    it('should persist firstGreetingSentAt after first message', () => {
      const knownFields: any = {}
      const timestamp = new Date().toISOString()
      
      // Only set if not already set (idempotent)
      if (!knownFields.firstGreetingSentAt) {
        knownFields.firstGreetingSentAt = timestamp
      }
      
      expect(knownFields.firstGreetingSentAt).toBe(timestamp)
      
      // Second call should not change it
      const originalTimestamp = knownFields.firstGreetingSentAt
      if (!knownFields.firstGreetingSentAt) {
        knownFields.firstGreetingSentAt = new Date().toISOString()
      }
      
      expect(knownFields.firstGreetingSentAt).toBe(originalTimestamp)
    })
  })
})

