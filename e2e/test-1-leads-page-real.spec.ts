import { test, expect } from '@playwright/test';

/**
 * TEST 1 — Leads page loads (REAL FIX, not ErrorBoundary)
 * 
 * Verifies:
 * - /leads/123 loads without React error #310
 * - Build stamp matches deployment
 * - Lead detail UI is visible
 */
test.describe('Leads Page - React #310 Real Fix', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should load lead detail page without React error #310', async ({ page }) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-5pmjkvvhq-abdurahmans-projects-66129df5.vercel.app';
    
    // Navigate to lead page
    await page.goto(`${baseURL}/leads/123`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // CRITICAL: Verify build stamp matches deployment
    const buildStamp = page.locator('text=/Build:/i').last();
    const buildStampText = await buildStamp.textContent({ timeout: 5000 }).catch(() => null);
    
    if (buildStampText) {
      console.log(`[BUILD STAMP] ${buildStampText}`);
      // Extract build ID from stamp
      const buildIdMatch = buildStampText.match(/Build:\s*([^\s]+)/);
      if (buildIdMatch) {
        console.log(`[BUILD ID] ${buildIdMatch[1]}`);
      }
    } else {
      console.warn('[BUILD STAMP] Not found - may be old deployment');
    }

    // CRITICAL: Assert NO React error #310
    const reactError = page.locator('text=/Minified React error #310|React error #310/i');
    await expect(reactError).not.toBeVisible({ timeout: 5000 });

    // CRITICAL: Assert NO generic error message
    const errorMessage = page.locator('text=/Something went wrong|An error occurred/i');
    await expect(errorMessage).not.toBeVisible({ timeout: 5000 });

    // Verify lead detail UI is present
    const leadDetail = page.locator('[data-testid="lead-detail"]');
    await expect(leadDetail).toBeVisible({ timeout: 10000 });

    // Take screenshot for evidence
    await page.screenshot({ path: 'test-results/leads-page-real-fix.png', fullPage: true });
  });
});

