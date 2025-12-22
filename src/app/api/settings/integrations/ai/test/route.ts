import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()
    
    const body = await req.json()
    const { provider, model, apiKey } = body

    if (!provider || !model || !apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: provider, model, apiKey' },
        { status: 400 }
      )
    }

    let testResult: any = {
      ok: false,
      provider,
      model,
      timestamp: new Date().toISOString(),
    }

    try {
      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Say "Hello" in one word.',
              },
            ],
            max_tokens: 10,
          }),
        })

        const data = await response.json()
        
        if (response.ok && data.choices?.[0]?.message?.content) {
          testResult.ok = true
          testResult.response = data.choices[0].message.content
        } else {
          testResult.error = data.error?.message || 'Unknown error'
        }
      } else if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Say "Hello" in one word.',
              },
            ],
            max_tokens: 10,
          }),
        })

        const data = await response.json()
        
        if (response.ok && data.choices?.[0]?.message?.content) {
          testResult.ok = true
          testResult.response = data.choices[0].message.content
        } else {
          testResult.error = data.error?.message || 'Unknown error'
        }
      } else if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 10,
            messages: [
              {
                role: 'user',
                content: 'Say "Hello" in one word.',
              },
            ],
          }),
        })

        const data = await response.json()
        
        if (response.ok && data.content?.[0]?.text) {
          testResult.ok = true
          testResult.response = data.content[0].text
        } else {
          testResult.error = data.error?.message || 'Unknown error'
        }
      } else {
        return NextResponse.json(
          { ok: false, error: `Unsupported provider: ${provider}` },
          { status: 400 }
        )
      }
    } catch (error: any) {
      testResult.ok = false
      testResult.error = error.message || 'Failed to connect to API'
    }

    if (testResult.ok) {
      return NextResponse.json(testResult)
    } else {
      return NextResponse.json(testResult, { status: 400 })
    }
  } catch (error: any) {
    console.error('POST /api/settings/integrations/ai/test error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to test AI connection' },
      { status: 500 }
    )
  }
}
















