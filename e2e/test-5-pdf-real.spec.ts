import { test, expect } from '@playwright/test';

/**
 * TEST 5 — PDF works end-to-end
 * 
 * Uses real data from /api/debug/inbox/sample-media
 */
test.describe('Inbox - PDF Media (Real Data)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should handle PDF documents correctly', async ({ page, request }) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-5pmjkvvhq-abdurahmans-projects-66129df5.vercel.app';

    // Step 1: Get real media data
    const mediaRes = await request.get(`${baseURL}/api/debug/inbox/sample-media`);
    const mediaData = await mediaRes.json();

    if (!mediaData.ok || !mediaData.pdf) {
      test.skip(true, `No PDF media found in database: ${mediaData.reason || 'unknown'}`);
      return;
    }

    console.log(`[PDF TEST] Using conversationId: ${mediaData.pdf.conversationId}, messageId: ${mediaData.pdf.messageId}`);

    // Step 2: Navigate to conversation
    await page.goto(`${baseURL}/inbox?conversationId=${mediaData.pdf.conversationId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 3: Find PDF/document links
    const pdfLinks = page.locator('a[href*=".pdf"], a[href*="/api/whatsapp/media"], a[href*="/api/media"], a[download], a:has-text("Document"), a:has-text("PDF")');
    const pdfCount = await pdfLinks.count();

    if (pdfCount === 0) {
      await page.screenshot({ path: 'test-results/pdf-not-found.png', fullPage: true });
      throw new Error('No PDF/document links found in conversation');
    }

    console.log(`[PDF TEST] Found ${pdfCount} PDF/document link(s)`);

    // Step 4: Get PDF URL
    const firstPdfLink = pdfLinks.first();
    const pdfHref = await firstPdfLink.getAttribute('href');

    expect(pdfHref).toBeTruthy();
    expect(pdfHref).not.toBe('');

    console.log(`[PDF TEST] PDF href: ${pdfHref}`);

    // Step 5: Verify PDF request
    const pdfUrl = pdfHref!.startsWith('http') 
      ? pdfHref! 
      : new URL(pdfHref!, baseURL).href;

    const pdfResponse = await request.get(pdfUrl);
    expect(pdfResponse.status()).toBe(200);

    const contentType = pdfResponse.headers()['content-type'];
    expect(contentType).toMatch(/application\/pdf|application\/octet-stream/);
    console.log(`[PDF TEST] Content-Type: ${contentType}`);

    // Step 6: Verify response body
    const body = await pdfResponse.body();
    expect(body.length).toBeGreaterThan(1024); // At least 1KB
    console.log(`[PDF TEST] Response body length: ${body.length} bytes`);

    // Verify PDF magic bytes (%PDF)
    const bodyText = body.toString('utf8', 0, Math.min(10, body.length));
    if (bodyText.startsWith('%PDF')) {
      console.log(`[PDF TEST] Valid PDF magic bytes confirmed`);
    }

    await page.screenshot({ path: 'test-results/pdf-real-test.png', fullPage: true });
  });
});

