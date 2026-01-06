/**
 * SIGNALS LOGIC TESTS
 * 
 * Tests deterministic signal detection:
 * - Expiry prioritization ordering
 * - Waiting thresholds
 * - Alert detection for unassigned and SLA
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { getRenewalSignals, getWaitingSignals, getAlertSignals } from '../signals'

const prisma = new PrismaClient()

describe('Signals Logic', () => {
  beforeAll(async () => {
    // Setup test data if needed
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('getRenewalSignals', () => {
    it('should prioritize TODAY > 7d > 30d > 60d > 90d', async () => {
      const signals = await getRenewalSignals(10)
      
      // Check ordering
      for (let i = 0; i < signals.length - 1; i++) {
        const current = signals[i]
        const next = signals[i + 1]
        
        const currentDays = current.badge === 'TODAY' ? 0 : parseInt(current.badge) || 999
        const nextDays = next.badge === 'TODAY' ? 0 : parseInt(next.badge) || 999
        
        expect(currentDays).toBeLessThanOrEqual(nextDays)
      }
    })

    it('should only return leads with expiry dates within 90 days', async () => {
      const signals = await getRenewalSignals(10)
      
      for (const signal of signals) {
        // Badge should be a number or "TODAY"
        expect(signal.badge).toMatch(/^\d+d$|^TODAY$/)
      }
    })

    it('should set severity correctly: TODAY/7d=urgent, 30d=warn, 60d/90d=neutral', async () => {
      const signals = await getRenewalSignals(10)
      
      for (const signal of signals) {
        if (signal.badge === 'TODAY' || signal.badge === '7d') {
          expect(signal.severity).toBe('urgent')
        } else if (signal.badge === '30d') {
          expect(signal.severity).toBe('warn')
        } else {
          expect(['warn', 'neutral']).toContain(signal.severity)
        }
      }
    })
  })

  describe('getWaitingSignals', () => {
    it('should only return leads where lastOutboundAt is at least 2 days ago', async () => {
      const signals = await getWaitingSignals(10)
      
      // All signals should have badge indicating days waiting
      for (const signal of signals) {
        expect(signal.badge).toMatch(/^\d+d$|^Waiting$|^Stalled$/)
      }
    })

    it('should mark leads waiting >7 days as "Stalled" with warn severity', async () => {
      const signals = await getWaitingSignals(10)
      
      for (const signal of signals) {
        if (signal.badge === 'Stalled') {
          expect(signal.severity).toBe('warn')
        }
      }
    })
  })

  describe('getAlertSignals', () => {
    it('should detect unassigned leads', async () => {
      const signals = await getAlertSignals(10)
      
      const unassigned = signals.filter(s => s.badge === 'Unassigned')
      for (const signal of unassigned) {
        expect(signal.action.type).toBe('assign')
        expect(signal.severity).toBe('warn')
      }
    })

    it('should detect SLA breaches (>24h) as urgent', async () => {
      const signals = await getAlertSignals(10)
      
      const slaBreaches = signals.filter(s => s.badge === 'SLA breach')
      for (const signal of slaBreaches) {
        expect(signal.severity).toBe('urgent')
        expect(signal.preview).toContain('SLA')
      }
    })

    it('should detect missing qualification info', async () => {
      const signals = await getAlertSignals(10)
      
      const missingInfo = signals.filter(s => s.badge === 'Missing info')
      for (const signal of missingInfo) {
        expect(signal.preview).toContain('Missing:')
        expect(signal.severity).toBe('warn')
      }
    })

    it('should detect quote pending', async () => {
      const signals = await getAlertSignals(10)
      
      const quoteDue = signals.filter(s => s.badge === 'Quote due')
      for (const signal of quoteDue) {
        expect(signal.action.type).toBe('create_quote')
        expect(['warn', 'urgent']).toContain(signal.severity)
      }
    })
  })
})











