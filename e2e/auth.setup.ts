import { test as setup, expect } from '@playwright/test';

/**
 * Authentication setup for E2E tests
 * Saves authenticated state to reuse in other tests
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL || 'admin@alainbcenter.com';
  const password = process.env.E2E_PASSWORD || 'CHANGE_ME';

  const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app';
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for login form - based on actual login page structure
  // Login page has: input#email, input#password, form with onSubmit
  await page.waitForSelector('input#email, input[name="email"], input[type="email"]', { timeout: 20000 });
  
  // Fill email (id="email" or name="email")
  const emailInput = page.locator('input#email, input[name="email"]').first();
  await emailInput.fill(email);
  
  // Fill password (id="password" or name="password")
  const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]').first();
  await passwordInput.fill(password);
  
  // Submit form (button[type="submit"] or form submit)
  const submitButton = page.locator('button[type="submit"], form button').first();
  await submitButton.click();

  // Wait for navigation away from login page (success) or error message
  await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 15000 }).catch(async () => {
    // If still on login page, check for error
    const errorText = page.locator('text=/error|invalid|failed/i');
    const errorCount = await errorText.count();
    if (errorCount > 0) {
      throw new Error('Login failed - check credentials');
    }
  });

  // Save authenticated state
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
