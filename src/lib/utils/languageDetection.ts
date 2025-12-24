/**
 * Simple language detection for Arabic vs English
 * Returns 'ar' if message contains Arabic characters, otherwise 'en'
 */
export function detectLanguage(text: string): 'en' | 'ar' {
  if (!text || text.trim().length === 0) {
    return 'en' // Default to English
  }

  // Arabic Unicode range: U+0600 to U+06FF (Arabic), U+0750 to U+077F (Arabic Supplement),
  // U+08A0 to U+08FF (Arabic Extended-A), U+FB50 to U+FDFF (Arabic Presentation Forms-A),
  // U+FE70 to U+FEFF (Arabic Presentation Forms-B)
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  
  // Check if text contains Arabic characters
  if (arabicRegex.test(text)) {
    return 'ar'
  }
  
  return 'en'
}

