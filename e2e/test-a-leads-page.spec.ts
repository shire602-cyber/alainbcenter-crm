import { test, expect } from '@playwright/test';

/**
 * TEST A — Leads page loads without React error #310
 * 
 * Verifies:
 * - /leads/123 loads successfully
 * - No React error #310
 * - No "Something went wrong" error
 * - Lead detail UI is visible
 */
test.describe('Leads Page - React #310 Fix', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should load lead detail page without React error', async ({ page }) => {
    // Navigate to a lead page
    await page.goto('/leads/123', { waitUntil: 'networkidle' });

    // CRITICAL: Assert NO React error #310
    const reactError = page.locator('text=/Minified React error #310|React error #310/i');
    await expect(reactError).not.toBeVisible({ timeout: 5000 });

    // CRITICAL: Assert NO generic error message
    const errorMessage = page.locator('text=/Something went wrong|An error occurred/i');
    await expect(errorMessage).not.toBeVisible({ timeout: 5000 });

    // Verify lead detail UI is present
    // Look for common lead page elements
    const leadElements = [
      page.locator('text=/Lead|Contact|Service/i'),
      page.locator('input, textarea, button'), // Interactive elements
      page.locator('[data-testid="lead-detail"]'), // If exists
    ];

    // At least one should be visible
    const visibleCount = await Promise.all(
      leadElements.map(async (locator) => {
        try {
          return await locator.first().isVisible({ timeout: 2000 });
        } catch {
          return false;
        }
      })
    );

    const hasVisibleElements = visibleCount.some(v => v === true);
    expect(hasVisibleElements).toBe(true);

    // Take screenshot for evidence
    await page.screenshot({ path: 'test-results/leads-page-success.png', fullPage: true });
  });

  test('should handle non-existent lead gracefully', async ({ page }) => {
    await page.goto('/leads/999999', { waitUntil: 'networkidle' });

    // Should show "Lead not found" or redirect, but NOT React error
    const reactError = page.locator('text=/Minified React error #310|React error #310/i');
    await expect(reactError).not.toBeVisible({ timeout: 5000 });
  });
});

