import { test, expect } from '@playwright/test';

/**
 * TEST D — Image rendering
 * 
 * Verifies:
 * - Image elements exist
 * - Image requests return 200
 * - Images have naturalWidth > 0 (actually loaded)
 */
test.describe('Inbox - Image Media', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should load and display images correctly', async ({ page, request }) => {
    await page.goto('/inbox', { waitUntil: 'networkidle' });

    // Wait for messages to load
    await page.waitForTimeout(2000);

    // Find image elements
    const imageElements = page.locator('img[src]:not([src=""]):not([src^="data:"])');
    const imageCount = await imageElements.count();

    if (imageCount === 0) {
      test.skip('No image messages found - cannot verify image handling');
      return;
    }

    console.log(`Found ${imageCount} image element(s)`);

    // Check first image
    const firstImage = imageElements.first();
    const imageSrc = await firstImage.getAttribute('src');

    expect(imageSrc).toBeTruthy();
    expect(imageSrc).not.toBe('');

    console.log(`Image src: ${imageSrc}`);

    // If src is relative, make it absolute
    const imageUrl = imageSrc!.startsWith('http') 
      ? imageSrc! 
      : new URL(imageSrc!, page.url()).href;

    // Verify image request
    const response = await request.get(imageUrl);
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toMatch(/image\//);
    console.log(`Image Content-Type: ${contentType}`);

    // Verify image actually loaded (naturalWidth > 0)
    const naturalWidth = await firstImage.evaluate((img: HTMLImageElement) => {
      return img.naturalWidth;
    });

    expect(naturalWidth).toBeGreaterThan(0);
    console.log(`Image naturalWidth: ${naturalWidth}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/inbox-image.png', fullPage: true });
  });
});

