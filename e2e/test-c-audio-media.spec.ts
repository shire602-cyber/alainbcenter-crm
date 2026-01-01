import { test, expect } from '@playwright/test';

/**
 * TEST C — Audio message request headers
 * 
 * Verifies:
 * - Audio requests return 200 or 206
 * - Content-Type is audio/*
 * - Accept-Ranges header present
 * - <audio> element has valid src
 */
test.describe('Inbox - Audio Media', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should handle audio messages with correct headers', async ({ page, request }) => {
    await page.goto('/inbox', { waitUntil: 'networkidle' });

    // Wait for conversations and messages
    await page.waitForTimeout(2000);

    // Find audio elements
    const audioElements = page.locator('audio[src]');
    const audioCount = await audioElements.count();

    if (audioCount === 0) {
      test.skip('No audio messages found - cannot verify audio handling');
      return;
    }

    console.log(`Found ${audioCount} audio element(s)`);

    // Check first audio element
    const firstAudio = audioElements.first();
    const audioSrc = await firstAudio.getAttribute('src');

    expect(audioSrc).toBeTruthy();
    expect(audioSrc).not.toBe('');

    console.log(`Audio src: ${audioSrc}`);

    // If src is relative, make it absolute
    const audioUrl = audioSrc!.startsWith('http') 
      ? audioSrc! 
      : new URL(audioSrc!, page.url()).href;

    // Intercept and verify the request
    const response = await request.get(audioUrl, {
      headers: {
        'Range': 'bytes=0-1023', // Request first 1KB to test Range support
      },
    });

    // Verify status (200 for full, 206 for partial)
    expect([200, 206]).toContain(response.status());
    console.log(`Audio response status: ${response.status()}`);

    // Verify Content-Type
    const contentType = response.headers()['content-type'];
    expect(contentType).toMatch(/audio\//);
    console.log(`Audio Content-Type: ${contentType}`);

    // Verify Accept-Ranges or Content-Range
    const acceptRanges = response.headers()['accept-ranges'];
    const contentRange = response.headers()['content-range'];
    
    if (response.status() === 206) {
      expect(contentRange).toBeTruthy();
      console.log(`Audio Content-Range: ${contentRange}`);
    } else {
      expect(acceptRanges).toContain('bytes');
      console.log(`Audio Accept-Ranges: ${acceptRanges}`);
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/inbox-audio.png', fullPage: true });
  });
});

