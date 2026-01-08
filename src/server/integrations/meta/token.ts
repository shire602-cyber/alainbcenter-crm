/**
 * Token validation and management
 * Isolated module for Meta token operations
 */

import { graphAPIGet } from './graph'

export interface MetaUser {
  id: string
  name: string
}

export interface MetaPage {
  id: string
  name: string
  access_token: string
}

export interface InstagramBusinessAccount {
  id: string
  username?: string
}

/**
 * Validate token by fetching user info
 */
export async function validateToken(token: string): Promise<MetaUser> {
  const user = await graphAPIGet<MetaUser>(
    '/me',
    token,
    ['id', 'name']
  )
  return user
}

/**
 * Get pages managed by the user
 */
export async function getUserPages(token: string): Promise<MetaPage[]> {
  const response = await graphAPIGet<{ data: MetaPage[] }>(
    '/me/accounts',
    token,
    ['id', 'name', 'access_token']
  )
  return response.data || []
}

/**
 * Get Instagram Business Account connected to a page
 */
export async function getInstagramBusinessAccount(
  pageId: string,
  pageAccessToken: string
): Promise<InstagramBusinessAccount | null> {
  try {
    const response = await graphAPIGet<{
      instagram_business_account?: {
        id: string
        username?: string
      }
    }>(
      `/${pageId}`,
      pageAccessToken,
      ['instagram_business_account{id,username}']
    )

    const igAccount = response.instagram_business_account
    if (!igAccount) {
      return null
    }

    return {
      id: igAccount.id,
      username: igAccount.username,
    }
  } catch (error: any) {
    // Instagram account might not be connected
    console.log(`No Instagram Business Account found for page ${pageId}:`, error.message)
    return null
  }
}

