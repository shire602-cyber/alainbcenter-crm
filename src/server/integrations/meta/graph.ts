/**
 * Minimal Meta Graph API wrapper
 * Isolated module for Meta API calls
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

export interface GraphAPIError {
  error: {
    message: string
    type: string
    code: number
  }
}

/**
 * Fetch from Graph API with error handling
 */
export async function graphAPIRequest<T>(
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${GRAPH_API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  const params = new URLSearchParams()
  params.set('access_token', accessToken)

  const urlWithToken = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`

  const response = await fetch(urlWithToken, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data as GraphAPIError
    throw new Error(
      `Graph API error (${response.status}): ${error.error?.message || response.statusText}`
    )
  }

  return data as T
}

/**
 * GET request to Graph API
 */
export async function graphAPIGet<T>(
  endpoint: string,
  accessToken: string,
  fields?: string[]
): Promise<T> {
  const url = new URL(
    endpoint.startsWith('http') 
      ? endpoint 
      : `${GRAPH_API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  )
  
  url.searchParams.set('access_token', accessToken)
  
  if (fields && fields.length > 0) {
    url.searchParams.set('fields', fields.join(','))
  }

  const response = await fetch(url.toString())
  const data = await response.json()

  if (!response.ok) {
    const error = data as GraphAPIError
    throw new Error(
      `Graph API error (${response.status}): ${error.error?.message || response.statusText}`
    )
  }

  return data as T
}

/**
 * POST request to Graph API
 */
export async function graphAPIPost<T>(
  endpoint: string,
  accessToken: string,
  body?: Record<string, any>
): Promise<T> {
  return graphAPIRequest<T>(
    endpoint,
    accessToken,
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }
  )
}

