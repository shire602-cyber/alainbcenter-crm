/**
 * CRITICAL FIX 3 TEST: Audio transcription does NOT produce JSON response output
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { transcribeAudio } from '../transcribeAudio'

// Mock fetch
global.fetch = vi.fn()

describe('Audio Transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should transcribe audio and return plain text, not JSON', async () => {
    // Mock Meta API media URL fetch
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://example.com/audio.ogg' }),
    })

    // Mock OpenAI Whisper API response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Hello, I need business setup services' }),
    })

    const result = await transcribeAudio('https://example.com/audio.ogg')

    expect(result.transcript).toBe('Hello, I need business setup services')
    expect(result.error).toBeUndefined()
    expect(typeof result.transcript).toBe('string')
    // Ensure transcript is not JSON
    expect(() => JSON.parse(result.transcript)).toThrow()
  })

  it('should handle transcription failure gracefully', async () => {
    // Mock Meta API media URL fetch failure
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    })

    const result = await transcribeAudio('invalid-media-id')

    expect(result.transcript).toBe('')
    expect(result.error).toBeDefined()
  })

  it('should return error if no API key configured', async () => {
    // Temporarily remove API key
    const originalKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const result = await transcribeAudio(Buffer.from('test'))

    expect(result.transcript).toBe('')
    expect(result.error).toBeDefined()
    expect(result.error).toContain('No audio transcription provider')

    // Restore API key
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey
    }
  })
})

