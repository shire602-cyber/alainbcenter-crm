/**
 * Sanitize AI reply text to prevent JSON-shaped replies from being sent/stored
 * 
 * Handles:
 * - JSON objects/strings like '{"reply":"Hello"}' -> extracts "Hello"
 * - Fenced JSON blocks like ```json {"response": "Hi"} ``` -> extracts "Hi"
 * - Plain strings -> returns as-is
 */

export interface SanitizeResult {
  text: string
  wasJson: boolean
}

/**
 * Sanitize reply text to ensure it's always plain text, never JSON
 */
export function sanitizeReplyText(input: string): SanitizeResult {
  if (!input || typeof input !== 'string') {
    return { text: String(input || '').trim(), wasJson: false }
  }

  let text = input.trim()

  // Remove JSON code fences if present
  const jsonFencePattern = /^```json\s*\n?([\s\S]*?)\n?```$/i
  const match = text.match(jsonFencePattern)
  if (match) {
    text = match[1].trim()
  }

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(text)
    
    // If it's an object, try to extract text fields
    if (typeof parsed === 'object' && parsed !== null) {
      // Priority order: response > message > reply > text > answer
      if (typeof parsed.response === 'string') {
        return { text: parsed.response.trim(), wasJson: true }
      }
      if (typeof parsed.message === 'string') {
        return { text: parsed.message.trim(), wasJson: true }
      }
      if (typeof parsed.reply === 'string') {
        return { text: parsed.reply.trim(), wasJson: true }
      }
      if (typeof parsed.text === 'string') {
        return { text: parsed.text.trim(), wasJson: true }
      }
      if (typeof parsed.answer === 'string') {
        return { text: parsed.answer.trim(), wasJson: true }
      }
      
      // If no string field found, return stringified version (fallback)
      return { text: JSON.stringify(parsed), wasJson: true }
    }
    
    // If it's a string (double-encoded JSON string), return it
    if (typeof parsed === 'string') {
      return { text: parsed.trim(), wasJson: true }
    }
  } catch {
    // Not JSON, continue with original text
  }

  // Return original text (already trimmed)
  return { text, wasJson: false }
}










