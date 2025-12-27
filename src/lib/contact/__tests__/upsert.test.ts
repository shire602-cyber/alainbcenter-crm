/**
 * Tests for Contact Upsert Logic
 */

import { upsertContact } from '../upsert'
import { prisma } from '../../prisma'

// Mock prisma
jest.mock('../../prisma', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

// Mock phone normalization
jest.mock('../../phone/normalize', () => ({
  normalizePhone: jest.fn((phone: string) => {
    if (phone.startsWith('+971')) return phone
    if (phone.startsWith('05')) return '+971' + phone.substring(1)
    return '+971' + phone
  }),
  extractWaId: jest.fn((payload: any) => payload?.waId || null),
}))

describe('Contact Upsert', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('upsertContact', () => {
    it('should find existing contact by waId', async () => {
      const existingContact = {
        id: 1,
        phone: '+971501234567',
        phoneNormalized: '+971501234567',
        waId: 'wa123',
        fullName: 'John Doe',
      }

      ;(prisma.contact.findUnique as jest.Mock).mockResolvedValueOnce(existingContact)

      const result = await upsertContact(prisma, {
        phone: '+971501234567',
        waId: 'wa123',
        fullName: 'John Doe Updated',
      })

      expect(result.id).toBe(1)
      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where: { waId: 'wa123' },
      })
    })

    it('should find existing contact by phoneNormalized', async () => {
      const existingContact = {
        id: 2,
        phone: '0501234567',
        phoneNormalized: '+971501234567',
        waId: null,
        fullName: 'Jane Doe',
      }

      ;(prisma.contact.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // waId lookup fails
        .mockResolvedValueOnce(existingContact) // phoneNormalized lookup succeeds

      const result = await upsertContact(prisma, {
        phone: '0501234567',
        fullName: 'Jane Doe',
      })

      expect(result.id).toBe(2)
      expect(result.phoneNormalized).toBe('+971501234567')
    })

    it('should create new contact if not found', async () => {
      const newContact = {
        id: 3,
        phone: '0501234567',
        phoneNormalized: '+971501234567',
        waId: null,
        fullName: 'New Contact',
      }

      ;(prisma.contact.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // waId lookup
        .mockResolvedValueOnce(null) // phoneNormalized lookup
      ;(prisma.contact.findFirst as jest.Mock).mockResolvedValueOnce(null) // phone lookup
      ;(prisma.contact.create as jest.Mock).mockResolvedValueOnce(newContact)

      const result = await upsertContact(prisma, {
        phone: '0501234567',
        fullName: 'New Contact',
        source: 'whatsapp',
      })

      expect(result.id).toBe(3)
      expect(prisma.contact.create).toHaveBeenCalled()
    })

    it('should update contact with missing waId', async () => {
      const existingContact = {
        id: 1,
        phone: '+971501234567',
        phoneNormalized: '+971501234567',
        waId: null,
        fullName: 'John Doe',
      }

      ;(prisma.contact.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // waId lookup
        .mockResolvedValueOnce(existingContact) // phoneNormalized lookup
      ;(prisma.contact.update as jest.Mock).mockResolvedValueOnce({
        ...existingContact,
        waId: 'wa123',
      })

      const result = await upsertContact(prisma, {
        phone: '+971501234567',
        waId: 'wa123',
        fullName: 'John Doe',
      })

      expect(result.waId).toBe('wa123')
      expect(prisma.contact.update).toHaveBeenCalled()
    })

    it('should normalize phone numbers', async () => {
      const newContact = {
        id: 4,
        phone: '0501234567',
        phoneNormalized: '+971501234567',
        waId: null,
        fullName: 'Test Contact',
      }

      ;(prisma.contact.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
      ;(prisma.contact.findFirst as jest.Mock).mockResolvedValueOnce(null)
      ;(prisma.contact.create as jest.Mock).mockResolvedValueOnce(newContact)

      const result = await upsertContact(prisma, {
        phone: '0501234567',
        fullName: 'Test Contact',
      })

      expect(result.phoneNormalized).toBe('+971501234567')
    })
  })
})

