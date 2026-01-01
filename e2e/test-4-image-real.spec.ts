import { test, expect } from '@playwright/test';

/**
 * TEST 4 — Image works end-to-end
 * 
 * Uses real data from /api/debug/inbox/sample-media
 */
test.describe('Inbox - Image Media (Real Data)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should load and display images correctly', async ({ page, request }) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-5pmjkvvhq-abdurahmans-projects-66129df5.vercel.app';

    // Step 1: Get real media data
    const mediaRes = await request.get(`${baseURL}/api/debug/inbox/sample-media`);
    const mediaData = await mediaRes.json();

    if (!mediaData.ok || !mediaData.image) {
      test.skip(true, `No image media found in database: ${mediaData.reason || 'unknown'}`);
      return;
    }

    console.log(`[IMAGE TEST] Using conversationId: ${mediaData.image.conversationId}, messageId: ${mediaData.image.messageId}`);

    // Step 2: Navigate to conversation
    await page.goto(`${baseURL}/inbox?conversationId=${mediaData.image.conversationId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 3: Find image elements
    const imageElements = page.locator('img[src]:not([src=""]):not([src^="data:"])');
    const imageCount = await imageElements.count();

    if (imageCount === 0) {
      await page.screenshot({ path: 'test-results/image-not-found.png', fullPage: true });
      throw new Error('No image elements found in conversation');
    }

    console.log(`[IMAGE TEST] Found ${imageCount} image element(s)`);

    // Check first image
    const firstImage = imageElements.first();
    const imageSrc = await firstImage.getAttribute('src');

    expect(imageSrc).toBeTruthy();
    expect(imageSrc).not.toBe('');

    console.log(`[IMAGE TEST] Image src: ${imageSrc}`);

    // Step 4: Verify image request
    const imageUrl = imageSrc!.startsWith('http') 
      ? imageSrc! 
      : new URL(imageSrc!, baseURL).href;

    const imageResponse = await request.get(imageUrl);
    expect(imageResponse.status()).toBe(200);

    const contentType = imageResponse.headers()['content-type'];
    expect(contentType).toMatch(/image\//);
    console.log(`[IMAGE TEST] Content-Type: ${contentType}`);

    // Step 5: Verify image actually loaded
    const naturalWidth = await firstImage.evaluate((img: HTMLImageElement) => {
      return img.naturalWidth;
    });

    expect(naturalWidth).toBeGreaterThan(0);
    console.log(`[IMAGE TEST] naturalWidth: ${naturalWidth}`);

    // Verify response body
    const body = await imageResponse.body();
    expect(body.length).toBeGreaterThan(0);
    console.log(`[IMAGE TEST] Response body length: ${body.length} bytes`);

    await page.screenshot({ path: 'test-results/image-real-test.png', fullPage: true });
  });
});

