/**
 * Instagram User Profile Fetcher
 * Fetches Instagram user profile information (name, username, profile photo) from Meta Graph API
 */

interface InstagramUserProfile {
  name: string | null
  username: string | null
  profilePic: string | null
}

/**
 * Fetch Instagram user profile information from Meta Graph API
 * 
 * @param instagramUserId - Instagram user ID (sender ID from webhook)
 * @param pageAccessToken - Facebook Page access token with instagram_basic permissions
 * @returns User profile information or null if fetch fails
 */
export async function fetchInstagramUserProfile(
  instagramUserId: string,
  pageAccessToken: string
): Promise<InstagramUserProfile | null> {
  try {
    // Meta Graph API endpoint for Instagram user profile
    // https://developers.facebook.com/docs/instagram-api/reference/ig-user
    const apiUrl = `https://graph.facebook.com/v20.0/${instagramUserId}?fields=name,username,profile_pic&access_token=${pageAccessToken}`
    
    console.log(`📸 [INSTAGRAM-PROFILE] Fetching profile for Instagram user ${instagramUserId}`, {
      instagramUserId,
      apiUrl: apiUrl.replace(pageAccessToken, '[REDACTED]'), // Redact token in logs
    })

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ [INSTAGRAM-PROFILE] Failed to fetch Instagram user profile`, {
        instagramUserId,
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 200),
      })
      return null
    }

    const profileData = await response.json()

    // Extract profile information
    const profile: InstagramUserProfile = {
      name: profileData.name || null,
      username: profileData.username || null,
      profilePic: profileData.profile_pic || null,
    }

    console.log(`✅ [INSTAGRAM-PROFILE] Fetched Instagram user profile`, {
      instagramUserId,
      name: profile.name || 'N/A',
      username: profile.username || 'N/A',
      hasProfilePic: !!profile.profilePic,
    })

    return profile
  } catch (error: any) {
    console.error(`❌ [INSTAGRAM-PROFILE] Error fetching Instagram user profile`, {
      instagramUserId,
      error: error.message,
      stack: error.stack?.substring(0, 200),
    })
    return null
  }
}

/**
 * Fetch multiple Instagram user profiles in parallel
 * 
 * @param instagramUserIds - Array of Instagram user IDs
 * @param pageAccessToken - Facebook Page access token
 * @returns Map of Instagram user ID to profile information
 */
export async function fetchMultipleInstagramProfiles(
  instagramUserIds: string[],
  pageAccessToken: string
): Promise<Map<string, InstagramUserProfile>> {
  const profiles = new Map<string, InstagramUserProfile>()
  
  // Fetch all profiles in parallel
  const profilePromises = instagramUserIds.map(async (userId) => {
    const profile = await fetchInstagramUserProfile(userId, pageAccessToken)
    if (profile) {
      profiles.set(userId, profile)
    }
    return { userId, profile }
  })

  await Promise.all(profilePromises)

  return profiles
}

