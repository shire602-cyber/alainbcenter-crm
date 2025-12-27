/**
 * Tests for Service Synonym Matching
 */

import { matchServiceWithSynonyms, getServiceSynonyms, getServiceDisplayName } from '../serviceSynonyms'

describe('Service Synonym Matching', () => {
  describe('matchServiceWithSynonyms', () => {
    it('should match exact keywords', () => {
      expect(matchServiceWithSynonyms('I need a family visa')).toBe('FAMILY_VISA')
      expect(matchServiceWithSynonyms('freelance visa please')).toBe('FREELANCE_VISA')
      expect(matchServiceWithSynonyms('golden visa')).toBe('GOLDEN_VISA')
    })

    it('should match synonyms', () => {
      expect(matchServiceWithSynonyms('I want a family residence visa')).toBe('FAMILY_VISA')
      expect(matchServiceWithSynonyms('freelance permit')).toBe('FREELANCE_VISA')
      expect(matchServiceWithSynonyms('10 year visa')).toBe('GOLDEN_VISA')
    })

    it('should match misspellings', () => {
      expect(matchServiceWithSynonyms('famili visa')).toBe('FAMILY_VISA')
      expect(matchServiceWithSynonyms('freelance viza')).toBe('FREELANCE_VISA')
    })

    it('should match Arabic translations', () => {
      expect(matchServiceWithSynonyms('تأشيرة عائلية')).toBe('FAMILY_VISA')
      expect(matchServiceWithSynonyms('عمل حر')).toBe('FREELANCE_VISA')
    })

    it('should prioritize exact keywords over synonyms', () => {
      // "family visa" (exact keyword) should score higher than "family residence visa" (synonym)
      const result = matchServiceWithSynonyms('I need a family visa and family residence visa')
      expect(result).toBe('FAMILY_VISA')
    })

    it('should return undefined for no match', () => {
      expect(matchServiceWithSynonyms('hello')).toBeUndefined()
      expect(matchServiceWithSynonyms('random text')).toBeUndefined()
    })

    it('should handle case insensitivity', () => {
      expect(matchServiceWithSynonyms('FAMILY VISA')).toBe('FAMILY_VISA')
      expect(matchServiceWithSynonyms('Freelance Visa')).toBe('FREELANCE_VISA')
    })
  })

  describe('getServiceSynonyms', () => {
    it('should return all synonyms for a service', () => {
      const synonyms = getServiceSynonyms('FAMILY_VISA')
      expect(synonyms).toContain('family visa')
      expect(synonyms).toContain('family residence visa')
      expect(synonyms.length).toBeGreaterThan(0)
    })

    it('should return empty array for unknown service', () => {
      const synonyms = getServiceSynonyms('UNKNOWN_SERVICE')
      expect(synonyms).toEqual([])
    })
  })

  describe('getServiceDisplayName', () => {
    it('should return formatted display name', () => {
      expect(getServiceDisplayName('FAMILY_VISA')).toBe('Family visa')
      expect(getServiceDisplayName('FREELANCE_VISA')).toBe('Freelance visa')
    })

    it('should handle unknown service', () => {
      expect(getServiceDisplayName('UNKNOWN_SERVICE')).toBe('Unknown Service')
    })
  })
})

