/**
 * Transcribe audio using available LLM provider
 * Prefers OpenAI Whisper if available, falls back to other providers
 */

export interface TranscribeResult {
  transcript: string
  language?: string
  error?: string
}

/**
 * Transcribe audio from buffer or URL
 */
export async function transcribeAudio(
  audioBuffer: Buffer | string, // Buffer or URL
  options: {
    language?: string // Optional: hint language code (en, ar, hi, ur, etc.)
  } = {}
): Promise<TranscribeResult> {
  try {
    // Prefer OpenAI Whisper if available
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (openaiApiKey) {
      return await transcribeWithOpenAI(audioBuffer, options)
    }
    
    // Fallback: Try DeepSeek if configured (may not support audio)
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY
    if (deepseekApiKey) {
      // DeepSeek doesn't support audio transcription, so skip
      console.warn('[TRANSCRIBE] DeepSeek does not support audio transcription, skipping')
    }
    
    // No transcription provider available
    return {
      transcript: '',
      error: 'No audio transcription provider configured. Set OPENAI_API_KEY for Whisper support.',
    }
  } catch (error: any) {
    console.error('[TRANSCRIBE] Transcription error:', error)
    return {
      transcript: '',
      error: error.message || 'Transcription failed',
    }
  }
}

/**
 * Transcribe using OpenAI Whisper API
 */
async function transcribeWithOpenAI(
  audioBuffer: Buffer | string,
  options: { language?: string }
): Promise<TranscribeResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  // If audioBuffer is a URL, fetch it first
  let buffer: Buffer
  if (typeof audioBuffer === 'string') {
    const response = await fetch(audioBuffer)
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else {
    buffer = audioBuffer
  }

  // Create form data for multipart/form-data request
  const formData = new FormData()
  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(buffer)
  const blob = new Blob([uint8Array], { type: 'audio/ogg' }) // Default to ogg, adjust if needed
  formData.append('file', blob, 'audio.ogg')
  formData.append('model', 'whisper-1')
  if (options.language) {
    formData.append('language', options.language)
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(`OpenAI Whisper API error: ${error.error?.message || 'Failed to transcribe'}`)
  }

  const data = await response.json()
  return {
    transcript: data.text || '',
    language: data.language || options.language,
  }
}

