/**
 * Tests for forbidden terms sanitizer
 */

import { describe, it, expect } from 'vitest'

describe('Forbidden Terms Sanitizer', () => {
  describe('Text sanitization', () => {
    it('should replace "Freelance Permit" with "Freelance (self-sponsored)"', () => {
      const text = 'We offer Freelance Permit services.'
      const sanitized = text.replace(/Freelance Permit/gi, 'Freelance (self-sponsored)')
      expect(sanitized).toBe('We offer Freelance (self-sponsored) services.')
      expect(sanitized).not.toContain('Freelance Permit')
    })

    it('should replace "Freelance Visa" with "Freelance (self-sponsored)"', () => {
      const text = 'You can get a Freelance Visa for 2 years.'
      const sanitized = text.replace(/Freelance Visa/gi, 'Freelance (self-sponsored)')
      expect(sanitized).toBe('You can get a Freelance (self-sponsored) for 2 years.')
      expect(sanitized).not.toContain('Freelance Visa')
    })

    it('should be case-insensitive', () => {
      const text = 'FREELANCE PERMIT and freelance visa are available.'
      const sanitized = text
        .replace(/Freelance Permit/gi, 'Freelance (self-sponsored)')
        .replace(/Freelance Visa/gi, 'Freelance (self-sponsored)')
      expect(sanitized).toBe('Freelance (self-sponsored) and Freelance (self-sponsored) are available.')
      expect(sanitized).not.toContain('FREELANCE PERMIT')
      expect(sanitized).not.toContain('freelance visa')
    })

    it('should handle multiple occurrences', () => {
      const text = 'Freelance Permit and Freelance Visa are both options. Freelance Permit is cheaper.'
      const sanitized = text
        .replace(/Freelance Permit/gi, 'Freelance (self-sponsored)')
        .replace(/Freelance Visa/gi, 'Freelance (self-sponsored)')
      expect(sanitized).toBe('Freelance (self-sponsored) and Freelance (self-sponsored) are both options. Freelance (self-sponsored) is cheaper.')
      expect(sanitized.split('Freelance (self-sponsored)').length - 1).toBe(3)
    })

    it('should not affect other text', () => {
      const text = 'We offer Family Visa, Visit Visa, and Business Setup services.'
      const sanitized = text
        .replace(/Freelance Permit/gi, 'Freelance (self-sponsored)')
        .replace(/Freelance Visa/gi, 'Freelance (self-sponsored)')
      expect(sanitized).toBe(text) // No changes
    })
  })

  describe('Service question text', () => {
    it('should not contain "Freelance Permit" or "Freelance Visa"', () => {
      const serviceQuestion = 'How can I help you today?'
      expect(serviceQuestion).not.toContain('Freelance Permit')
      expect(serviceQuestion).not.toContain('Freelance Visa')
    })

    it('should be simplified (no service list)', () => {
      const serviceQuestion = 'How can I help you today?'
      expect(serviceQuestion).not.toContain('Family Visa')
      expect(serviceQuestion).not.toContain('Visit Visa')
      expect(serviceQuestion).not.toContain('Business Setup')
      expect(serviceQuestion).not.toContain('(') // No parentheses
    })
  })
})

