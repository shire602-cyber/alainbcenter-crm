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

/**
 * Lead Ads: Fetch leadgen details from Graph API
 * 
 * @param leadgenId - The lead ID from the webhook (e.g., "12345678901234567")
 * @param accessToken - Page access token with leads_retrieval permission
 * @returns Lead data including field_data, or null if unavailable
 * 
 * Graph API endpoint: GET /{leadgen_id}?fields=created_time,field_data,form_id,ad_id
 */
export interface LeadGenData {
  id: string
  created_time?: string
  field_data?: Array<{ name: string; values: string[] }>
  form_id?: string
  ad_id?: string
}

export async function getLeadGen(
  leadgenId: string,
  accessToken: string
): Promise<LeadGenData | null> {
  try {
    console.log(`📋 [META-LEADGEN] Fetching lead details for leadgen_id: ${leadgenId}`)
    
    const data = await graphAPIGet<LeadGenData>(
      `/${leadgenId}`,
      accessToken,
      ['created_time', 'field_data', 'form_id', 'ad_id']
    )
    
    console.log(`✅ [META-LEADGEN] Successfully fetched lead data`, {
      leadgenId,
      hasFieldData: !!data.field_data,
      fieldCount: data.field_data?.length || 0,
      formId: data.form_id || 'N/A',
      adId: data.ad_id || 'N/A',
      createdTime: data.created_time || 'N/A',
    })
    
    return data
  } catch (error: any) {
    // Log error but don't throw - allow graceful degradation
    console.warn(`⚠️ [META-LEADGEN] Failed to fetch lead details (graceful degradation)`, {
      leadgenId,
      error: error.message,
      note: 'Lead will be created with minimal data from webhook payload',
    })
    return null
  }
}

