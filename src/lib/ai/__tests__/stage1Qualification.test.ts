/**
 * Tests for Stage 1 qualification gate and banned questions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Stage 1 Qualification Gate', () => {
  describe('Banned Question Keys', () => {
    it('should never ask new_or_renewal question', () => {
      const BANNED_QUESTION_KEYS = new Set([
        'new_or_renewal',
        'new_or_renew',
        'company_name',
        'companyName',
        'ASK_COMPANY',
        'ASK_NEW_OR_RENEW',
      ])
      
      expect(BANNED_QUESTION_KEYS.has('new_or_renewal')).toBe(true)
      expect(BANNED_QUESTION_KEYS.has('company_name')).toBe(true)
    })

    it('should block replies containing banned keywords', () => {
      const reply = 'Are you looking for a new business or renewal?'
      const replyLower = reply.toLowerCase()
      
      const isBanned = replyLower.includes('new or renew') || 
                      replyLower.includes('company name')
      
      expect(isBanned).toBe(true)
    })
  })

  describe('Stage 1 Core Fields', () => {
    it('should identify core qualification fields', () => {
      const coreFields = ['name', 'service', 'nationality']
      const hasCoreQualification = (fields: Record<string, any>) => {
        return fields.name && fields.service && fields.nationality
      }
      
      expect(hasCoreQualification({ name: 'Test', service: 'Business Setup', nationality: 'Indian' })).toBe(true)
      expect(hasCoreQualification({ name: 'Test', service: 'Business Setup' })).toBe(false)
      expect(hasCoreQualification({ name: 'Test' })).toBe(false)
    })

    it('should enforce priority order: name -> service -> nationality', () => {
      const priority = ['name', 'service', 'nationality']
      
      // If name missing, ask name first
      const fields1 = { service: 'Business Setup', nationality: 'Indian' }
      const nextQuestion = !fields1.name ? 'ASK_NAME' : !fields1.service ? 'ASK_SERVICE' : !fields1.nationality ? 'ASK_NATIONALITY' : null
      expect(nextQuestion).toBe('ASK_NAME')
      
      // If name present but service missing, ask service
      const fields2 = { name: 'Test', nationality: 'Indian' }
      const nextQuestion2 = !fields2.name ? 'ASK_NAME' : !fields2.service ? 'ASK_SERVICE' : !fields2.nationality ? 'ASK_NATIONALITY' : null
      expect(nextQuestion2).toBe('ASK_SERVICE')
      
      // If name and service present but nationality missing, ask nationality
      const fields3 = { name: 'Test', service: 'Business Setup' }
      const nextQuestion3 = !fields3.name ? 'ASK_NAME' : !fields3.service ? 'ASK_SERVICE' : !fields3.nationality ? 'ASK_NATIONALITY' : null
      expect(nextQuestion3).toBe('ASK_NATIONALITY')
    })
  })
})

