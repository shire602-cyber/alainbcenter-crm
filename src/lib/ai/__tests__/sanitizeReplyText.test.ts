/**
 * CRITICAL FIX 2 TEST: Sanitize reply text to prevent JSON from being sent/stored
 */

import { describe, it, expect } from 'vitest'
import { sanitizeReplyText } from '../sanitizeReplyText'

describe('sanitizeReplyText', () => {
  it('should extract text from JSON object with "response" field', () => {
    const input = '{"response": "Hello, how can I help you?"}'
    const result = sanitizeReplyText(input)
    
    expect(result.text).toBe('Hello, how can I help you?')
    expect(result.wasJson).toBe(true)
  })

  it('should extract text from JSON object with "message" field', () => {
    const input = '{"message": "Thanks for your inquiry"}'
    const result = sanitizeReplyText(input)
    
    expect(result.text).toBe('Thanks for your inquiry')
    expect(result.wasJson).toBe(true)
  })

  it('should extract text from fenced JSON block', () => {
    const input = '```json\n{"reply": "This is a reply"}\n```'
    const result = sanitizeReplyText(input)
    
    expect(result.text).toBe('This is a reply')
    expect(result.wasJson).toBe(true)
  })

  it('should return plain text as-is if not JSON', () => {
    const input = 'Hello, how can I help you?'
    const result = sanitizeReplyText(input)
    
    expect(result.text).toBe('Hello, how can I help you?')
    expect(result.wasJson).toBe(false)
  })

  it('should handle double-encoded JSON string', () => {
    const input = '"{\\"reply\\": \\"Hello\\"}"'
    const result = sanitizeReplyText(input)
    
    // Should parse and extract
    expect(result.wasJson).toBe(true)
  })

  it('should trim whitespace', () => {
    const input = '  {"response": "Hello"}  '
    const result = sanitizeReplyText(input)
    
    expect(result.text).toBe('Hello')
    expect(result.wasJson).toBe(true)
  })

  it('should handle empty string', () => {
    const result = sanitizeReplyText('')
    
    expect(result.text).toBe('')
    expect(result.wasJson).toBe(false)
  })
})










