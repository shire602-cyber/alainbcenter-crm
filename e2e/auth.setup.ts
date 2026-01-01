import { test as setup, expect } from '@playwright/test';

/**
 * Authentication setup for E2E tests
 * Saves authenticated state to reuse in other tests
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL || 'admin@alainbcenter.com';
  const password = process.env.E2E_PASSWORD || 'CHANGE_ME';

  await page.goto('/login');
  
  // Wait for login form
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  
  // Fill and submit login form
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submitButton.click();

  // Wait for navigation away from login page (success) or error message
  await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 15000 }).catch(() => {
    // If still on login page, check for error
    const errorText = page.locator('text=/error|invalid|failed/i');
    if (errorText.count() > 0) {
      throw new Error('Login failed - check credentials');
    }
  });

  // Save authenticated state
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});

