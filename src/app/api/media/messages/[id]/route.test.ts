/**
 * Unit tests for media proxy route
 * 
 * Tests:
 * - mediaProxyUrl generation logic
 * - Route handler behavior when message has providerMediaId vs not
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mock dependencies
vi.mock('@/lib/authApi')
vi.mock('@/lib/prisma', () => ({
  prisma: {
    message: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/media/whatsappMedia', () => ({
  getWhatsAppDownloadUrl: vi.fn(),
  fetchWhatsAppMediaStream: vi.fn(),
  getWhatsAppAccessToken: vi.fn(),
}))

describe('GET /api/media/messages/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 404 if message not found', async () => {
    const { requireAuthApi } = await import('@/lib/authApi')
    vi.mocked(requireAuthApi).mockResolvedValue({ id: 1 } as any)
    vi.mocked(prisma.message.findUnique).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/media/messages/123')
    const response = await GET(req, { params: Promise.resolve({ id: '123' }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Media not available')
    expect(data.reason).toBe('Message not found')
  })

  it('should return 404 if message has no mediaUrl', async () => {
    const { requireAuthApi } = await import('@/lib/authApi')
    vi.mocked(requireAuthApi).mockResolvedValue({ id: 1 } as any)
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      id: 123,
      type: 'text',
      mediaUrl: null,
      mediaMimeType: null,
      channel: 'whatsapp',
    } as any)

    const req = new NextRequest('http://localhost/api/media/messages/123')
    const response = await GET(req, { params: Promise.resolve({ id: '123' }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Media not available')
    expect(data.reason).toBe('No media ID in message')
  })

  it('should generate mediaProxyUrl correctly when message has media', () => {
    // This is a unit test for the logic, not the route itself
    const message = {
      id: 123,
      type: 'audio',
      mediaUrl: 'whatsapp-media-id-123',
      mediaMimeType: 'audio/ogg',
    }

    const hasMedia = message.type && ['audio', 'image', 'document', 'video'].includes(message.type)
    const hasProviderMediaId = !!message.mediaUrl
    const mediaRenderable = hasMedia && hasProviderMediaId
    const mediaProxyUrl = mediaRenderable ? `/api/media/messages/${message.id}` : null

    expect(mediaRenderable).toBe(true)
    expect(mediaProxyUrl).toBe('/api/media/messages/123')
  })

  it('should not generate mediaProxyUrl for text messages', () => {
    const message = {
      id: 123,
      type: 'text',
      mediaUrl: null,
      mediaMimeType: null,
    }

    const hasMedia = message.type && ['audio', 'image', 'document', 'video'].includes(message.type)
    const hasProviderMediaId = !!message.mediaUrl
    const mediaRenderable = hasMedia && hasProviderMediaId
    const mediaProxyUrl = mediaRenderable ? `/api/media/messages/${message.id}` : null

    expect(mediaRenderable).toBe(false)
    expect(mediaProxyUrl).toBe(null)
  })
})









