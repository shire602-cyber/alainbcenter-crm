/**
 * Meta Graph API helper functions
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

export interface MetaPage {
  id: string
  name: string
  access_token?: string
}

export interface InstagramBusinessAccount {
  id: string
  username?: string
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string
): Promise<{ access_token: string; expires_in?: number }> {
  const url = `${GRAPH_API_BASE}/oauth/access_token`
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`${url}?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code: ${response.status} - ${error}`)
  }

  return await response.json()
}

/**
 * Get pages managed by the user
 */
export async function getUserPages(accessToken: string): Promise<MetaPage[]> {
  const url = `${GRAPH_API_BASE}/me/accounts`
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,access_token',
  })

  const response = await fetch(`${url}?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get pages: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.data || []
}

/**
 * Get page access token (long-lived)
 */
export async function getPageAccessToken(
  pageId: string,
  userAccessToken: string
): Promise<string> {
  const url = `${GRAPH_API_BASE}/${pageId}`
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: 'access_token',
  })

  const response = await fetch(`${url}?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get page token: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Get Instagram Business Account connected to a page
 */
export async function getInstagramBusinessAccount(
  pageId: string,
  pageAccessToken: string
): Promise<InstagramBusinessAccount | null> {
  const url = `${GRAPH_API_BASE}/${pageId}`
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: 'instagram_business_account{id,username}',
  })

  const response = await fetch(`${url}?${params.toString()}`)
  
  if (!response.ok) {
    // Instagram account might not be connected, return null
    return null
  }

  const data = await response.json()
  const igAccount = data.instagram_business_account
  
  if (!igAccount) {
    return null
  }

  return {
    id: igAccount.id,
    username: igAccount.username,
  }
}

/**
 * Subscribe page to webhook fields
 */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
  webhookUrl: string,
  verifyToken: string,
  fields: string[] = ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'leadgen']
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps`
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    subscribed_fields: fields.join(','),
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to subscribe page ${pageId} to webhook:`, error)
    // Don't throw - subscription might already exist
  }
}

