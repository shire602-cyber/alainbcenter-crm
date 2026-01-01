import { test, expect } from '@playwright/test';

/**
 * TEST E — PDF open
 * 
 * Verifies:
 * - PDF links exist
 * - PDF requests return 200
 * - Content-Type is application/pdf
 */
test.describe('Inbox - PDF Media', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should handle PDF documents correctly', async ({ page, request }) => {
    await page.goto('/inbox', { waitUntil: 'networkidle' });

    // Wait for messages to load
    await page.waitForTimeout(2000);

    // Find PDF/document links
    const pdfLinks = page.locator('a[href*=".pdf"], a[href*="/api/whatsapp/media"], a[download], a:has-text("Document"), a:has-text("PDF")');
    const pdfCount = await pdfLinks.count();

    if (pdfCount === 0) {
      test.skip('No PDF/document messages found - cannot verify PDF handling');
      return;
    }

    console.log(`Found ${pdfCount} PDF/document link(s)`);

    // Check first PDF link
    const firstPdfLink = pdfLinks.first();
    const pdfHref = await firstPdfLink.getAttribute('href');

    expect(pdfHref).toBeTruthy();
    expect(pdfHref).not.toBe('');

    console.log(`PDF href: ${pdfHref}`);

    // If href is relative, make it absolute
    const pdfUrl = pdfHref!.startsWith('http') 
      ? pdfHref! 
      : new URL(pdfHref!, page.url()).href;

    // Verify PDF request
    const response = await request.get(pdfUrl);
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toMatch(/application\/pdf|application\/octet-stream/);
    console.log(`PDF Content-Type: ${contentType}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/inbox-pdf.png', fullPage: true });
  });
});

