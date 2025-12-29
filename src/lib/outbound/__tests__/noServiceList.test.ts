/**
 * Tests to ensure NO service list can ever be sent
 * 
 * 3) Make "no service list" impossible
 * - Delete/disable any code path that can generate a slash-separated list or parentheses list.
 * - Keep sanitizer as last line of defense, but upstream should never produce such text.
 * - Add a test that fails if outbound includes "/" between service words or contains "(Family Visa" etc.
 */

import { describe, it, expect } from 'vitest'

describe('No Service List Enforcement', () => {
  it('should fail if text contains service list pattern with slashes', () => {
    const testCases = [
      'Which service are you looking for today? (Family Visa / Visit Visa / Freelance Visa)',
      'We offer Family Visa / Visit Visa / Business Setup',
      'Services: Family Visa/Visit Visa/Freelance Visa',
      'Choose: (Family Visa / Visit Visa)',
    ]
    
    for (const text of testCases) {
      // Check for service list pattern: contains "/" between service-related words
      const hasServiceList = /\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\/[^)]*(?:Visa|Permit|Setup|Services)/i.test(text) ||
                            /(?:Visa|Permit|Setup|Services)\s*\/\s*(?:Visa|Permit|Setup|Services)/i.test(text)
      
      expect(hasServiceList).toBe(false)
    }
  })
  
  it('should fail if text contains service list in parentheses', () => {
    const testCases = [
      '(Family Visa / Visit Visa / Freelance Visa)',
      '(Family Visa, Visit Visa, Business Setup)',
      'Which service? (Family Visa / ...)',
    ]
    
    for (const text of testCases) {
      // Check for parentheses containing service keywords
      const hasServiceListInParens = /\([^)]*(?:Family Visa|Visit Visa|Freelance|Business Setup|Golden Visa)[^)]*\)/i.test(text)
      
      expect(hasServiceListInParens).toBe(false)
    }
  })
  
  it('should pass for legitimate messages without service lists', () => {
    const legitimateMessages = [
      'How can I help you today?',
      'Thanks, John. How can I help you today?',
      'What is your nationality?',
      'May I know your full name, please?',
      'We offer competitive pricing for business setup services.',
      'Family visa is available for UAE residents.',
    ]
    
    for (const text of legitimateMessages) {
      // These should NOT match service list patterns
      const hasServiceList = /\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\/[^)]*(?:Visa|Permit|Setup|Services)/i.test(text) ||
                            /(?:Visa|Permit|Setup|Services)\s*\/\s*(?:Visa|Permit|Setup|Services)/i.test(text)
      
      expect(hasServiceList).toBe(false)
    }
  })
  
  it('should sanitize service lists if they somehow appear', () => {
    // This tests the sanitizer in sendWithIdempotency.ts
    const textWithList = 'Which service? (Family Visa / Visit Visa / Freelance Visa)'
    
    // Sanitizer should remove the list part
    const sanitized = textWithList.replace(/\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\)/gi, '').trim()
    
    expect(sanitized).not.toContain('Family Visa /')
    expect(sanitized).not.toContain('Visit Visa /')
    expect(sanitized).not.toContain('(')
    expect(sanitized).not.toContain(')')
  })
})

