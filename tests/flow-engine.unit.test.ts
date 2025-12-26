/**
 * Unit Tests: Flow Engine / Rule Engine Logic
 * 
 * Tests conversation flow state management and question repeat prevention
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  loadFlowState, 
  updateFlowState, 
  wasQuestionAsked, 
  recordQuestionAsked,
  recordCollectedData 
} from '../src/lib/conversation/flowState'
import { getTestPrisma, cleanTestDb, setupTestDb, closeTestDb } from './helpers/testDb'

describe('Flow Engine Unit Tests', () => {
  let prisma: ReturnType<typeof getTestPrisma>
  let testConversationId: number
  let testContactId: number

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn('⚠️ TEST_DATABASE_URL not set - skipping unit tests')
      return
    }
    await setupTestDb()
    prisma = getTestPrisma()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    if (!process.env.TEST_DATABASE_URL || !prisma) {
      return // Skip if no test DB
    }
    
    await cleanTestDb()
    
    // Create test contact and conversation
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test Contact',
        phone: `+971${Math.floor(Math.random() * 1000000000)}`,
      },
    })
    testContactId = contact.id

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channel: 'whatsapp',
      },
    })
    testConversationId = conversation.id
  })

  describe('2.1 Step Repeat Prevention', () => {
    it('should NOT ask same question if already asked recently', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Conversation already asked SPONSOR_VISA_TYPE
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_SPONSOR_VISA_TYPE',
        lastQuestionKey: 'SPONSOR_VISA_TYPE',
        lastQuestionAt: new Date(), // Just asked
      })

      // When: Check if we can ask again
      const canAsk = await wasQuestionAsked(
        testConversationId,
        'SPONSOR_VISA_TYPE',
        3 // 3 minutes minimum
      )

      // Then: Should return true (already asked)
      expect(canAsk).toBe(true)
    })

    it('should allow asking again after time window (3+ minutes)', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Asked 4 minutes ago
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000)
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_SPONSOR_VISA_TYPE',
        lastQuestionKey: 'SPONSOR_VISA_TYPE',
        lastQuestionAt: fourMinutesAgo,
      })

      // When: Check if we can ask again
      const canAsk = await wasQuestionAsked(
        testConversationId,
        'SPONSOR_VISA_TYPE',
        3 // 3 minutes minimum
      )

      // Then: Should return false (can ask clarification)
      expect(canAsk).toBe(false)
    })

    it('should skip asking if question key matches lastQuestionKey', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Already asked
      await recordQuestionAsked(testConversationId, 'SPONSOR_VISA_TYPE', 'WAIT_SPONSOR_VISA_TYPE')

      // When: Try to ask again immediately
      const state = await loadFlowState(testConversationId)
      
      // Then: Should have lastQuestionKey set
      expect(state.lastQuestionKey).toBe('SPONSOR_VISA_TYPE')
      expect(state.flowStep).toBe('WAIT_SPONSOR_VISA_TYPE')
      
      // And: Should prevent asking again
      const alreadyAsked = await wasQuestionAsked(testConversationId, 'SPONSOR_VISA_TYPE', 3)
      expect(alreadyAsked).toBe(true)
    })
  })

  describe('2.2 Allowed Clarification After Time Window', () => {
    it('should allow clarification if 3+ minutes passed and user gave irrelevant reply', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Asked 4 minutes ago, user replied with "?"
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000)
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_SPONSOR_VISA_TYPE',
        lastQuestionKey: 'SPONSOR_VISA_TYPE',
        lastQuestionAt: fourMinutesAgo,
      })

      // When: Check if clarification is allowed
      const canAsk = await wasQuestionAsked(testConversationId, 'SPONSOR_VISA_TYPE', 3)
      
      // Then: Should allow clarification (returns false = can ask)
      expect(canAsk).toBe(false)
      
      // And: Clarification message should be different/shorter
      // (This is tested in integration tests where we check actual message content)
    })

    it('should NOT allow clarification if less than 3 minutes passed', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Asked 2 minutes ago
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_SPONSOR_VISA_TYPE',
        lastQuestionKey: 'SPONSOR_VISA_TYPE',
        lastQuestionAt: twoMinutesAgo,
      })

      // When: Check if clarification is allowed
      const canAsk = await wasQuestionAsked(testConversationId, 'SPONSOR_VISA_TYPE', 3)
      
      // Then: Should NOT allow (returns true = already asked)
      expect(canAsk).toBe(true)
    })
  })

  describe('2.3 Store Answer Advances Step', () => {
    it('should store answer and advance flow step', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Waiting for sponsor visa type
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_SPONSOR_VISA_TYPE',
        lastQuestionKey: 'SPONSOR_VISA_TYPE',
      })

      // When: User answers "Partner"
      await recordCollectedData(testConversationId, {
        sponsorVisaType: 'partner',
      })

      // Then: Data should be stored
      const state = await loadFlowState(testConversationId)
      expect(state.collectedData?.sponsorVisaType).toBe('partner')
      
      // And: Next question should NOT be sponsor visa type
      // (This is tested in integration where rule engine advances step)
    })

    it('should merge collected data without overwriting', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // Setup: Already have some data
      await recordCollectedData(testConversationId, {
        sponsorVisaType: 'partner',
      })

      // When: Add more data
      await recordCollectedData(testConversationId, {
        familyLocation: 'inside',
      })

      // Then: Both should be present
      const state = await loadFlowState(testConversationId)
      expect(state.collectedData?.sponsorVisaType).toBe('partner')
      expect(state.collectedData?.familyLocation).toBe('inside')
    })
  })

  describe('Flow State Persistence', () => {
    it('should persist and load flow state correctly', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // When: Update flow state
      await updateFlowState(testConversationId, {
        flowKey: 'family_visa',
        flowStep: 'WAIT_FAMILY_LOCATION',
        lastQuestionKey: 'FAMILY_LOCATION',
        collectedData: {
          sponsorVisaType: 'partner',
          nationality: 'indian',
        },
      })

      // Then: Should load correctly
      const state = await loadFlowState(testConversationId)
      expect(state.flowKey).toBe('family_visa')
      expect(state.flowStep).toBe('WAIT_FAMILY_LOCATION')
      expect(state.lastQuestionKey).toBe('FAMILY_LOCATION')
      expect(state.collectedData?.sponsorVisaType).toBe('partner')
      expect(state.collectedData?.nationality).toBe('indian')
    })

    it('should handle empty state gracefully', async () => {
      if (!process.env.TEST_DATABASE_URL || !prisma) {
        console.log('⏭️ Skipping test - TEST_DATABASE_URL not set')
        return
      }
      // When: Load state for new conversation
      const state = await loadFlowState(testConversationId)

      // Then: Should return empty object
      expect(state.flowKey).toBeUndefined()
      expect(state.flowStep).toBeUndefined()
      expect(state.lastQuestionKey).toBeUndefined()
      expect(state.collectedData).toEqual({})
    })
  })
})

