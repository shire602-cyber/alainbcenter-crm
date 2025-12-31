/**
 * Detect language from text
 * Uses simple heuristics or LLM provider if available
 */

export type LanguageCode = 'en' | 'ar' | 'hi' | 'ur' | 'fr' | 'es' | 'de' | 'zh' | 'ja' | 'ko'

/**
 * Simple heuristic-based language detection
 * Falls back to 'en' if uncertain
 */
export function detectLanguageSimple(text: string): LanguageCode {
  if (!text || text.trim().length === 0) {
    return 'en' // Default
  }

  const lowerText = text.toLowerCase()
  
  // Arabic detection (Arabic script)
  if (/[\u0600-\u06FF]/.test(text)) {
    return 'ar'
  }
  
  // Hindi/Urdu detection (Devanagari or Urdu script)
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi'
  }
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text) && /[\u0600-\u06FF]/.test(text)) {
    // Urdu uses Arabic script with additional characters
    // Check for Urdu-specific words
    const urduKeywords = ['کیا', 'ہے', 'میں', 'آپ', 'کے', 'لیے']
    if (urduKeywords.some(kw => text.includes(kw))) {
      return 'ur'
    }
  }
  
  // French detection
  const frenchKeywords = ['bonjour', 'merci', 'oui', 'non', 'comment', 'pourquoi', 'aujourd\'hui']
  if (frenchKeywords.some(kw => lowerText.includes(kw))) {
    return 'fr'
  }
  
  // Spanish detection
  const spanishKeywords = ['hola', 'gracias', 'sí', 'no', 'cómo', 'por qué', 'hoy']
  if (spanishKeywords.some(kw => lowerText.includes(kw))) {
    return 'es'
  }
  
  // German detection
  const germanKeywords = ['hallo', 'danke', 'ja', 'nein', 'wie', 'warum', 'heute']
  if (germanKeywords.some(kw => lowerText.includes(kw))) {
    return 'de'
  }
  
  // Chinese detection (simplified or traditional)
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'zh'
  }
  
  // Japanese detection
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return 'ja'
  }
  
  // Korean detection
  if (/[\uac00-\ud7a3]/.test(text)) {
    return 'ko'
  }
  
  // Default to English
  return 'en'
}

/**
 * Detect language using LLM provider (if available)
 * Falls back to simple heuristic
 */
export async function detectLanguage(
  text: string,
  options: {
    useLLM?: boolean // Use LLM for detection (more accurate but slower)
  } = {}
): Promise<LanguageCode> {
  // For now, use simple heuristic
  // In future, can add LLM-based detection if needed
  return detectLanguageSimple(text)
}

