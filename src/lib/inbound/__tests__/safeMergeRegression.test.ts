/**
 * SAFE MERGE REGRESSION TEST
 * 
 * Tests that setting service on turn 1 cannot be wiped by empty extracted fields on turn 2
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { mergeJsonSafe, buildLeadUpdateFromExtracted } from '../mergeCollectedData'

const prisma = new PrismaClient()

describe('Safe Merge Regression', () => {
  beforeAll(async () => {
    // Setup if needed
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('mergeJsonSafe', () => {
    it('should never overwrite existing non-empty values with null/undefined', () => {
      const existing = {
        service: 'FREELANCE_VISA',
        requestedServiceRaw: 'freelance visa',
        nationality: 'Indian',
      }

      const incoming = {
        service: null,
        requestedServiceRaw: undefined,
        nationality: null,
      }

      const merged = mergeJsonSafe(existing, incoming)

      expect(merged.service).toBe('FREELANCE_VISA')
      expect(merged.requestedServiceRaw).toBe('freelance visa')
      expect(merged.nationality).toBe('Indian')
    })

    it('should merge new values when existing is empty', () => {
      const existing = {
        service: null,
        requestedServiceRaw: '',
      }

      const incoming = {
        service: 'FREELANCE_VISA',
        requestedServiceRaw: 'freelance visa',
      }

      const merged = mergeJsonSafe(existing, incoming)

      expect(merged.service).toBe('FREELANCE_VISA')
      expect(merged.requestedServiceRaw).toBe('freelance visa')
    })

    it('should deep merge nested objects', () => {
      const existing = {
        counts: {
          partners: 2,
          visas: 3,
        },
        identity: {
          name: 'John Doe',
        },
      }

      const incoming = {
        counts: {
          visas: 4, // Update visas, preserve partners
        },
        identity: {
          email: 'john@example.com', // Add email, preserve name
        },
      }

      const merged = mergeJsonSafe(existing, incoming)

      expect(merged.counts.partners).toBe(2) // Preserved
      expect(merged.counts.visas).toBe(4) // Updated
      expect(merged.identity.name).toBe('John Doe') // Preserved
      expect(merged.identity.email).toBe('john@example.com') // Added
    })
  })

  describe('buildLeadUpdateFromExtracted', () => {
    it('should only set defined, non-empty values', () => {
      const extracted = {
        service: 'FREELANCE_VISA',
        nationality: 'Indian',
        expiries: [{ type: 'visa', date: new Date('2026-02-09') }],
        businessActivityRaw: null, // Should not be set
        serviceRaw: undefined, // Should not be set
      }

      const update = buildLeadUpdateFromExtracted(extracted)

      expect(update.serviceTypeEnum).toBe('FREELANCE_VISA')
      expect(update.businessActivityRaw).toBeUndefined()
      expect(update.requestedServiceRaw).toBeUndefined()
      expect(update.expiryDate).toBeDefined()
    })

    it('should not set fields when extracted is empty', () => {
      const extracted = {
        service: null,
        nationality: undefined,
        expiries: null,
      }

      const update = buildLeadUpdateFromExtracted(extracted)

      expect(update.serviceTypeEnum).toBeUndefined()
      expect(update.expiryDate).toBeUndefined()
    })
  })
})

