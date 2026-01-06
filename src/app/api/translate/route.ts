import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getAIConfig } from '@/lib/ai/client'

/**
 * POST /api/translate
 * Translate text to English (or specified target language)
 * 
 * Body:
 * {
 *   text: string,
 *   targetLang?: "en" (default)
 * }
 * 
 * Returns:
 * {
 *   translatedText: string,
 *   detectedLang?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const body = await req.json()
    const { text, targetLang = 'en' } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text parameter' },
        { status: 400 }
      )
    }

    // Get AI config (supports DeepSeek, OpenAI, Groq, Anthropic)
    const config = await getAIConfig()

    if (!config) {
      return NextResponse.json(
        { error: 'AI not configured. Please configure an AI provider in settings.' },
        { status: 500 }
      )
    }

    // Build translation prompt
    const prompt = `Translate the following text to ${targetLang === 'en' ? 'English' : targetLang}. 
Only return the translation, no explanations or additional text.

Text to translate:
"${text}"`

    let apiUrl: string
    let headers: Record<string, string>
    let bodyPayload: any

    // Use the same provider logic as extractData.ts
    if (config.provider === 'deepseek') {
      apiUrl = 'https://api.deepseek.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      bodyPayload = {
        model: config.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a translation assistant. Translate the given text accurately and return only the translation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }
    } else if (config.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      bodyPayload = {
        model: config.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a translation assistant. Translate the given text accurately and return only the translation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }
    } else if (config.provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      bodyPayload = {
        model: config.model || 'llama-3.1-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a translation assistant. Translate the given text accurately and return only the translation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }
    } else if (config.provider === 'anthropic') {
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      bodyPayload = {
        model: config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported AI provider' },
        { status: 500 }
      )
    }

    // Call AI API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('[TRANSLATE] AI API error:', error)
      return NextResponse.json(
        { error: error.error?.message || 'Translation failed' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Extract translation from response (different formats for different providers)
    let translatedText: string
    if (config.provider === 'anthropic') {
      translatedText = data.content?.[0]?.text || data.content || ''
    } else {
      // OpenAI-compatible format (DeepSeek, OpenAI, Groq)
      translatedText = data.choices?.[0]?.message?.content || ''
    }

    if (!translatedText) {
      return NextResponse.json(
        { error: 'No translation received from AI' },
        { status: 500 }
      )
    }

    // Simple language detection heuristic
    const detectedLang = detectLanguage(text)

    return NextResponse.json({
      translatedText: translatedText.trim(),
      detectedLang,
    })
  } catch (error: any) {
    console.error('[TRANSLATE] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Translation failed' },
      { status: 500 }
    )
  }
}

/**
 * Simple language detection heuristic
 * Returns language code or 'unknown'
 */
function detectLanguage(text: string): string {
  // Check for Arabic (common in UAE)
  const arabicRegex = /[\u0600-\u06FF]/
  if (arabicRegex.test(text)) {
    return 'ar'
  }

  // Check for mostly ASCII (likely English)
  const asciiRatio = (text.match(/[\x00-\x7F]/g) || []).length / text.length
  if (asciiRatio > 0.9) {
    return 'en'
  }

  return 'unknown'
}

