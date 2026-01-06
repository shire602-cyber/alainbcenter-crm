/**
 * PHASE 5E: Tests for Quote Follow-ups
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { scheduleQuoteFollowups, getNextQuoteFollowup } from '../quoteFollowups'
import { prisma } from '../../prisma'

// Mock Prisma
vi.mock('../../prisma', () => ({
  prisma: {
    lead: {
      findUnique: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

describe('scheduleQuoteFollowups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create exactly 5 tasks on first run', async () => {
    const leadId = 1
    const sentAt = new Date('2025-01-01T10:00:00Z')

    // Mock lead exists and is not Won/Lost
    ;(prisma.lead.findUnique as any).mockResolvedValue({
      id: leadId,
      stage: 'QUALIFIED',
    })

    // Mock no existing tasks
    ;(prisma.task.findUnique as any).mockResolvedValue(null)

    // Mock task creation
    ;(prisma.task.create as any).mockImplementation((args: any) => ({
      id: Math.random(),
      ...args.data,
    }))

    const result = await scheduleQuoteFollowups({
      leadId,
      sentAt,
    })

    expect(result.created).toBe(5)
    expect(result.skipped).toBe(0)
    expect(prisma.task.create).toHaveBeenCalledTimes(5)
  })

  it('should be idempotent - re-running creates no duplicates', async () => {
    const leadId = 1
    const sentAt = new Date('2025-01-01T10:00:00Z')

    ;(prisma.lead.findUnique as any).mockResolvedValue({
      id: leadId,
      stage: 'QUALIFIED',
    })

    // Mock existing tasks exist
    ;(prisma.task.findUnique as any).mockResolvedValue({
      id: 1,
      title: 'Quote follow-up D+3',
    })

    const result = await scheduleQuoteFollowups({
      leadId,
      sentAt,
    })

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(5)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('should skip when lead stage is Won', async () => {
    const leadId = 1

    ;(prisma.lead.findUnique as any).mockResolvedValue({
      id: leadId,
      stage: 'COMPLETED_WON',
    })

    const result = await scheduleQuoteFollowups({
      leadId,
    })

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(5)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('should skip when lead stage is Lost', async () => {
    const leadId = 1

    ;(prisma.lead.findUnique as any).mockResolvedValue({
      id: leadId,
      stage: 'LOST',
    })

    const result = await scheduleQuoteFollowups({
      leadId,
    })

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(5)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('should create tasks with correct dueAt offsets', async () => {
    const leadId = 1
    const sentAt = new Date('2025-01-01T10:00:00Z')

    ;(prisma.lead.findUnique as any).mockResolvedValue({
      id: leadId,
      stage: 'QUALIFIED',
    })

    ;(prisma.task.findUnique as any).mockResolvedValue(null)

    const createdTasks: any[] = []
    ;(prisma.task.create as any).mockImplementation((args: any) => {
      createdTasks.push(args.data)
      return { id: Math.random(), ...args.data }
    })

    await scheduleQuoteFollowups({
      leadId,
      sentAt,
    })

    // Check that tasks are created with correct cadence days
    const cadences = [3, 5, 7, 9, 12]
    cadences.forEach((cadence, idx) => {
      const task = createdTasks[idx]
      expect(task.title).toBe(`Quote follow-up D+${cadence}`)
      expect(task.idempotencyKey).toBe(`quote_followup:${leadId}:none:${cadence}`)
      
      // Verify dueAt is approximately sentAt + cadence days at 10:00 AM
      const expectedDueAt = new Date(sentAt)
      expectedDueAt.setDate(expectedDueAt.getDate() + cadence)
      expectedDueAt.setHours(10, 0, 0, 0)
      
      const actualDueAt = new Date(task.dueAt)
      expect(actualDueAt.getDate()).toBe(expectedDueAt.getDate())
      expect(actualDueAt.getHours()).toBe(10)
    })
  })
})

describe('getNextQuoteFollowup', () => {
  it('should return next follow-up task if exists', async () => {
    const leadId = 1
    const mockTask = {
      id: 1,
      title: 'Quote follow-up D+3',
      dueAt: new Date('2025-01-04T10:00:00Z'),
    }

    ;(prisma.task.findMany as any).mockResolvedValue([mockTask])

    const result = await getNextQuoteFollowup(leadId)

    expect(result.task).not.toBeNull()
    expect(result.task?.cadenceDays).toBe(3)
    expect(result.daysUntil).toBeGreaterThanOrEqual(0)
  })

  it('should return null if no follow-up tasks exist', async () => {
    const leadId = 1

    ;(prisma.task.findMany as any).mockResolvedValue([])

    const result = await getNextQuoteFollowup(leadId)

    expect(result.task).toBeNull()
    expect(result.daysUntil).toBeNull()
  })
})










