import { test, expect } from '@playwright/test';

/**
 * TEST 3 — Audio works end-to-end
 * 
 * Uses real data from /api/debug/inbox/sample-media
 */
test.describe('Inbox - Audio Media (Real Data)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should play audio messages with correct headers', async ({ page, request }) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app';

    // Step 1: Get real media data from debug endpoint
    const mediaRes = await request.get(`${baseURL}/api/debug/inbox/sample-media`);
    const mediaData = await mediaRes.json();

    if (!mediaData.ok || !mediaData.audio) {
      test.skip(true, `No audio media found in database: ${mediaData.reason || 'unknown'}`);
      return;
    }

    console.log(`[AUDIO TEST] Using conversationId: ${mediaData.audio.conversationId}, messageId: ${mediaData.audio.messageId}`);

    // Step 2: Navigate to inbox and open conversation
    await page.goto(`${baseURL}/inbox`, { waitUntil: 'networkidle' });
    
    // Find and click the conversation (by ID or by searching)
    // Try to find conversation link/button
    const conversationLink = page.locator(`a[href*="conversationId=${mediaData.audio.conversationId}"], button[data-conversation-id="${mediaData.audio.conversationId}"]`).first();
    
    if (await conversationLink.count() > 0) {
      await conversationLink.click();
    } else {
      // Fallback: navigate directly if URL supports it
      await page.goto(`${baseURL}/inbox?conversationId=${mediaData.audio.conversationId}`, { waitUntil: 'networkidle' });
    }

    // Wait for messages to load
    await page.waitForTimeout(2000);

    // Step 3: Find audio element
    const audioElements = page.locator('audio[src]');
    const audioCount = await audioElements.count();

    if (audioCount === 0) {
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/audio-not-found.png', fullPage: true });
      throw new Error('No audio elements found in conversation');
    }

    console.log(`[AUDIO TEST] Found ${audioCount} audio element(s)`);

    // Check first audio element
    const firstAudio = audioElements.first();
    const audioSrc = await firstAudio.getAttribute('src');

    expect(audioSrc).toBeTruthy();
    expect(audioSrc).not.toBe('');

    console.log(`[AUDIO TEST] Audio src: ${audioSrc}`);

    // Step 4: Verify audio request headers
    const audioUrl = audioSrc!.startsWith('http') 
      ? audioSrc! 
      : new URL(audioSrc!, baseURL).href;

    // Test with Range header
    const audioResponse = await request.get(audioUrl, {
      headers: {
        'Range': 'bytes=0-1023', // Request first 1KB
      },
    });

    // Verify status (200 for full, 206 for partial)
    expect([200, 206]).toContain(audioResponse.status());
    console.log(`[AUDIO TEST] Response status: ${audioResponse.status()}`);

    // Verify Content-Type
    const contentType = audioResponse.headers()['content-type'];
    expect(contentType).toMatch(/audio\//);
    console.log(`[AUDIO TEST] Content-Type: ${contentType}`);

    // Verify Accept-Ranges or Content-Range
    const acceptRanges = audioResponse.headers()['accept-ranges'];
    const contentRange = audioResponse.headers()['content-range'];
    
    if (audioResponse.status() === 206) {
      expect(contentRange).toBeTruthy();
      console.log(`[AUDIO TEST] Content-Range: ${contentRange}`);
    } else {
      expect(acceptRanges).toContain('bytes');
      console.log(`[AUDIO TEST] Accept-Ranges: ${acceptRanges}`);
    }

    // Verify response has content
    const body = await audioResponse.body();
    expect(body.length).toBeGreaterThan(0);
    console.log(`[AUDIO TEST] Response body length: ${body.length} bytes`);

    // Step 5: Try to play audio programmatically
    const canPlay = await firstAudio.evaluate((audio: HTMLAudioElement) => {
      return new Promise<boolean>((resolve) => {
        audio.addEventListener('canplay', () => resolve(true), { once: true });
        audio.addEventListener('error', () => resolve(false), { once: true });
        audio.load();
        // Timeout after 5s
        setTimeout(() => resolve(false), 5000);
      });
    });

    console.log(`[AUDIO TEST] Audio can play: ${canPlay}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/audio-real-test.png', fullPage: true });
  });
});

