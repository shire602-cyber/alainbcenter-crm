/**
 * Unit tests for normalizeInboundPhone
 * Tests phone normalization for inbound WhatsApp messages
 */

import { describe, it, expect } from 'vitest'
import { normalizeInboundPhone } from '../phone-inbound'

describe('normalizeInboundPhone', () => {
  describe('Digits-only international numbers', () => {
    it('should normalize "260777711059" to "+260777711059" (Zambia)', () => {
      const result = normalizeInboundPhone('260777711059')
      expect(result).toBe('+260777711059')
      expect(result.startsWith('+')).toBe(true)
    })

    it('should normalize "971501234567" to "+971501234567" (UAE)', () => {
      const result = normalizeInboundPhone('971501234567')
      expect(result).toBe('+971501234567')
      expect(result.startsWith('+')).toBe(true)
    })

    it('should keep "+971501234567" as-is if already has +', () => {
      const result = normalizeInboundPhone('+971501234567')
      expect(result).toBe('+971501234567')
    })
  })

  describe('Edge cases', () => {
    it('should handle numbers with whitespace', () => {
      const result = normalizeInboundPhone('  260777711059  ')
      expect(result).toBe('+260777711059')
    })

    it('should handle numbers with non-digit characters', () => {
      const result = normalizeInboundPhone('260-777-711-059')
      expect(result).toBe('+260777711059')
    })

    it('should throw error for empty string', () => {
      expect(() => normalizeInboundPhone('')).toThrow('Phone number is required')
    })

    it('should throw error for invalid phone numbers', () => {
      expect(() => normalizeInboundPhone('123')).toThrow('Failed to normalize')
      expect(() => normalizeInboundPhone('abc')).toThrow('Failed to normalize')
    })

    it('should throw error for non-string input', () => {
      expect(() => normalizeInboundPhone(null as any)).toThrow('Phone number is required')
      expect(() => normalizeInboundPhone(undefined as any)).toThrow('Phone number is required')
    })
  })

  describe('E.164 validation', () => {
    it('should return valid E.164 format', () => {
      const testCases = [
        { input: '260777711059', expected: '+260777711059' },
        { input: '971501234567', expected: '+971501234567' },
        { input: '+971501234567', expected: '+971501234567' },
      ]

      testCases.forEach(({ input, expected }) => {
        const result = normalizeInboundPhone(input)
        expect(result).toBe(expected)
        expect(result).toMatch(/^\+[1-9]\d{1,14}$/) // E.164 format
      })
    })
  })
})

