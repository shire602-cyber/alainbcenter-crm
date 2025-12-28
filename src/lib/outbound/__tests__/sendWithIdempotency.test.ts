/**
 * Unit tests for sendWithIdempotency text normalization
 */

import { describe, it, expect } from 'vitest'
import { normalizeOutboundText } from '../sendWithIdempotency'

describe('normalizeOutboundText', () => {
  it('should extract reply from JSON object', () => {
    // Test case: input = {"reply":"Hello"} (object) -> "Hello"
    const input = { reply: 'Hello' }
    const result = normalizeOutboundText(input)
    expect(result).toBe('Hello')
  })

  it('should extract reply from JSON string', () => {
    // Test case: input = '{"reply":"Hello"}' (string) -> "Hello"
    const input = '{"reply":"Hello"}'
    const result = normalizeOutboundText(input)
    expect(result).toBe('Hello')
  })

  it('should return plain string as-is', () => {
    // Test case: input = "Hello" -> "Hello"
    const input = 'Hello'
    const result = normalizeOutboundText(input)
    expect(result).toBe('Hello')
  })

  it('should handle JSON string with whitespace', () => {
    const input = '  {"reply": "Hello World"}  '
    const result = normalizeOutboundText(input)
    expect(result).toBe('Hello World')
  })

  it('should handle object with text property', () => {
    const input = { text: 'Hello from text property' }
    const result = normalizeOutboundText(input)
    expect(result).toBe('Hello from text property')
  })

  it('should handle null/undefined', () => {
    expect(normalizeOutboundText(null)).toBe('')
    expect(normalizeOutboundText(undefined)).toBe('')
  })

  it('should handle non-JSON strings', () => {
    const input = 'This is a plain message'
    const result = normalizeOutboundText(input)
    expect(result).toBe('This is a plain message')
  })

  it('should handle invalid JSON strings gracefully', () => {
    const input = '{invalid json}'
    const result = normalizeOutboundText(input)
    // Should return the string as-is if JSON parse fails
    expect(result).toBe('{invalid json}')
  })
})

