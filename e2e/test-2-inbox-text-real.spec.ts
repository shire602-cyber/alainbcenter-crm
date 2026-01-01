import { test, expect } from '@playwright/test';

/**
 * TEST 2 — Inbox text not misclassified as media
 * 
 * Verifies messages with text show actual text, not "[Media message]"
 */
test.describe('Inbox - Text Message Rendering (Real Data)', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should display text messages correctly, not "[Media message]"', async ({ page }) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://alainbcenter-5pmjkvvhq-abdurahmans-projects-66129df5.vercel.app';

    await page.goto(`${baseURL}/inbox`, { waitUntil: 'networkidle' });

    // Wait for conversations list
    await page.waitForSelector('text=/Conversation|Chat|Message/i', { timeout: 10000 });

    // Click first conversation
    const firstConversation = page.locator('[role="button"], a, div[class*="conversation"], div[class*="chat"]').first();
    
    try {
      await firstConversation.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      // If no clickable conversation, messages may already be visible
      console.log('No clickable conversation found, looking for messages directly');
    }

    // Look for message bubbles
    const messages = page.locator('div[class*="message"], div[class*="bubble"], p[class*="text"]');
    const messageCount = await messages.count();

    if (messageCount === 0) {
      test.skip(true, 'No messages found in inbox - cannot verify text rendering');
      return;
    }

    // Check each message for text content vs "[Media message]"
    let foundTextMessage = false;
    let foundIncorrectMediaPlaceholder = false;
    const incorrectMessages: string[] = [];

    for (let i = 0; i < Math.min(messageCount, 20); i++) {
      const message = messages.nth(i);
      const text = await message.textContent();
      
      if (text && text.includes('[Media message]')) {
        // Check if this message actually has text fields that should be displayed
        // Look for any text content in the message element or its children
        const hasTextContent = await message.evaluate((el) => {
          // Check for text nodes or input/textarea with value
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent && node.textContent.trim().length > 2 && !node.textContent.includes('[Media message]')) {
              return true;
            }
          }
          return false;
        });

        if (hasTextContent) {
          foundIncorrectMediaPlaceholder = true;
          incorrectMessages.push(`Message ${i}: "${text.substring(0, 50)}..."`);
        }
      } else if (text && text.trim() && !text.match(/^\[.*\]$/) && text.trim().length > 2) {
        // This is a real text message
        foundTextMessage = true;
        console.log(`[TEXT TEST] Found text message: ${text.substring(0, 50)}...`);
      }
    }

    // Take screenshot for evidence
    await page.screenshot({ path: 'test-results/inbox-text-real-test.png', fullPage: true });

    // Assertions
    expect(foundTextMessage).toBe(true);
    
    if (foundIncorrectMediaPlaceholder) {
      console.error('[TEXT TEST] Found messages incorrectly showing "[Media message]":', incorrectMessages);
      throw new Error(`Found ${incorrectMessages.length} message(s) incorrectly showing "[Media message]" when text exists`);
    }
  });
});

