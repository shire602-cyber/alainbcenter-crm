/**
 * Tests for Field Extractors
 */

import { extractService, extractNationality, extractExpiry, extractIdentity } from '../fieldExtractors'

describe('Field Extractors', () => {
  describe('extractService', () => {
    it('should extract family visa', () => {
      expect(extractService('I need a family visa')).toBe('FAMILY_VISA')
      expect(extractService('wife visa')).toBe('FAMILY_VISA')
      expect(extractService('children visa')).toBe('FAMILY_VISA')
    })

    it('should extract freelance visa', () => {
      expect(extractService('freelance visa')).toBe('FREELANCE_VISA')
      expect(extractService('I want freelance')).toBe('FREELANCE_VISA')
    })

    it('should extract golden visa', () => {
      expect(extractService('golden visa')).toBe('GOLDEN_VISA')
      expect(extractService('10 year visa')).toBe('GOLDEN_VISA')
    })

    it('should extract business setup', () => {
      expect(extractService('business setup')).toBe('MAINLAND_BUSINESS_SETUP')
      expect(extractService('company license')).toBe('MAINLAND_BUSINESS_SETUP')
    })

    it('should use synonym matching', () => {
      // Should use synonym matching from serviceSynonyms.ts
      expect(extractService('family residence visa')).toBe('FAMILY_VISA')
      expect(extractService('freelance permit')).toBe('FREELANCE_VISA')
    })
  })

  describe('extractNationality', () => {
    it('should extract nationality from patterns', () => {
      expect(extractNationality('I am Indian')).toBe('Indian')
      expect(extractNationality("I'm Pakistani")).toBe('Pakistani')
      expect(extractNationality('from Philippines')).toBe('Philippines')
    })

    it('should extract from country demonyms', () => {
      expect(extractNationality('I am indian')).toBe('Indian')
      expect(extractNationality('pakistani national')).toBe('Pakistani')
    })

    it('should return undefined for no match', () => {
      expect(extractNationality('hello')).toBeUndefined()
    })
  })

  describe('extractExpiry', () => {
    it('should extract explicit dates only', () => {
      const result = extractExpiry('My visa expires on 10/02/2026')
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].date).toBeInstanceOf(Date)
    })

    it('should not extract relative dates', () => {
      const result = extractExpiry('My visa expires next month')
      expect(result.length).toBe(0) // Should return empty for relative dates
    })

    it('should extract multiple expiry types', () => {
      const result = extractExpiry('Visa expires 10/02/2026 and Emirates ID expires 15/03/2026')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('extractIdentity', () => {
    it('should extract email', () => {
      const result = extractIdentity('My email is test@example.com')
      expect(result.email).toBe('test@example.com')
    })

    it('should extract name from patterns', () => {
      const result = extractIdentity('My name is John Doe')
      expect(result.name).toBe('John Doe')
    })

    it('should filter out common false positives', () => {
      const result = extractIdentity('Hi Business Setup')
      expect(result.name).toBeUndefined() // Should not extract "Business Setup" as name
    })
  })
})

