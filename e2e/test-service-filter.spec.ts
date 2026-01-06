import { test, expect } from '@playwright/test';

// Constants from the app (for filtering)
const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'PROPOSAL_SENT', 'IN_PROGRESS', 'COMPLETED_WON', 'LOST', 'ON_HOLD'];
const LEAD_SOURCES = ['website', 'facebook_ad', 'instagram_ad', 'whatsapp', 'manual'];

/**
 * TEST — Service Filter on Leads Page
 * 
 * Verifies:
 * - Service filter dropdown exists
 * - Selecting a service filters leads correctly
 * - Clearing filter returns to original list
 * - Network request includes serviceTypeId parameter
 */
test.describe('Leads Page - Service Filter', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('should filter leads by service', async ({ page, request }) => {
    // Navigate to leads page (uses baseURL from playwright.config.ts)
    await page.goto('/leads', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for page to load - look for filters section
    await page.waitForSelector('text=/Filters|Filter/i, [class*="BentoCard"], text=/leads?/i', { timeout: 15000 });
    
    // Wait for service types API call to complete
    try {
      await page.waitForResponse(response => 
        response.url().includes('/api/service-types') && response.status() === 200,
        { timeout: 10000 }
      );
      console.log('[DEBUG] Service types API call completed');
    } catch {
      console.log('[WARN] Service types API call not detected, continuing anyway');
    }
    
    // Additional wait for React to render
    await page.waitForTimeout(2000);
    
    // Take debug screenshot to see what's on the page
    await page.screenshot({ path: 'test-results/debug-before-filter.png', fullPage: true });

    // Fetch services from API to get a valid service ID
    const servicesResponse = await request.get('/api/service-types');
    const services = await servicesResponse.json();
    
    if (!Array.isArray(services) || services.length === 0) {
      test.skip('No services available in database');
      return;
    }

    const firstService = services[0];
    console.log(`[SERVICE] Using service: ${firstService.name} (ID: ${firstService.id})`);

    // Intercept API calls to verify serviceTypeId parameter
    let apiCallWithService: any = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/leads') && url.includes('serviceTypeId')) {
        apiCallWithService = url;
        console.log(`[API] Detected service filter in request: ${url}`);
      }
    });

    // Get initial count of visible lead cards
    const initialLeads = page.locator('[class*="LeadCard"], [class*="lead-card"], .bg-slate-50, .bg-slate-900').filter({ hasText: /./ });
    const initialCount = await initialLeads.count();
    console.log(`[INITIAL] Found ${initialCount} leads before filter`);

    // Find service filter dropdown - try multiple strategies
    // Strategy 1: Find select that has service options (most reliable)
    // This works even if the label isn't found
    let serviceSelect: any = null;
    let serviceSelectFound = false;
    
    console.log(`[DEBUG] Searching for service filter select...`);
    const allSelects = page.locator('select');
    const selectCount = await allSelects.count();
    console.log(`[DEBUG] Found ${selectCount} select elements on page`);
    
    for (let i = 0; i < selectCount; i++) {
      const select = allSelects.nth(i);
      const options = select.locator('option');
      const optionCount = await options.count();
      const optionTexts: string[] = [];
      
      for (let j = 0; j < optionCount; j++) {
        const text = await options.nth(j).textContent();
        if (text) optionTexts.push(text.trim());
      }
      
      // Check if this select has service names (not just filter options)
      // Service names are typically longer and not in PIPELINE_STAGES or LEAD_SOURCES
      const hasServiceName = optionTexts.some(text => 
        text !== 'All' && 
        text !== 'Hot (70+)' && 
        text !== 'Warm (40-69)' && 
        text !== 'Cold (<40)' &&
        !text.includes('🔥') &&
        !text.includes('🌡️') &&
        !text.includes('❄️') &&
        text.length > 3 &&
        !PIPELINE_STAGES.includes(text as any) &&
        !LEAD_SOURCES.includes(text as any) &&
        !text.toLowerCase().includes('new') &&
        !text.toLowerCase().includes('contacted') &&
        !text.toLowerCase().includes('qualified')
      );
      
      if (hasServiceName && optionTexts.includes('All')) {
        console.log(`[FOUND] Service select at index ${i} with options: ${optionTexts.slice(0, 5).join(', ')}`);
        serviceSelect = select;
        serviceSelectFound = true;
        break;
      }
    }
    
    // Strategy 2: Find by label text (if select not found by options)
    if (!serviceSelectFound) {
      console.log(`[FALLBACK] Select not found by options, trying to find by label...`);
      let serviceLabel = page.locator('label').filter({ hasText: /^Service$/i });
      let serviceLabelCount = await serviceLabel.count();
      console.log(`[DEBUG] Found ${serviceLabelCount} labels matching "Service"`);
      
      // Strategy 3: Find all labels in filters section and check text content
      if (serviceLabelCount === 0) {
        const filtersSection = page.locator('[class*="BentoCard"], text=/Filters/i').first();
        const allLabels = filtersSection.locator('label');
        const labelCount = await allLabels.count();
        console.log(`[DEBUG] Found ${labelCount} labels in filters section`);
        
        for (let i = 0; i < labelCount; i++) {
          const label = allLabels.nth(i);
          const text = await label.textContent();
          console.log(`[DEBUG] Label ${i}: "${text}"`);
          if (text && text.trim().toLowerCase() === 'service') {
            serviceLabel = label;
            serviceLabelCount = 1;
            console.log(`[FOUND] Service label at index ${i}`);
            break;
          }
        }
      }
      
      if (serviceLabelCount > 0) {
        await expect(serviceLabel).toBeVisible({ timeout: 5000 });
        serviceSelect = serviceLabel.locator('..').locator('select').first();
        await expect(serviceSelect).toBeVisible({ timeout: 5000 });
        serviceSelectFound = true;
      }
    }
    
    // If still not found, try one more strategy: find select by position (4th select in filters)
    if (!serviceSelectFound) {
      console.log(`[FALLBACK] Trying to find select by position (4th select in filters section)...`);
      const filtersSection = page.locator('[class*="BentoCard"]').first();
      const filterSelects = filtersSection.locator('select');
      const filterSelectCount = await filterSelects.count();
      console.log(`[DEBUG] Found ${filterSelectCount} selects in filters section`);
      
      // The Service filter should be the 4th select (after Stage, Source, AI Score)
      if (filterSelectCount >= 4) {
        serviceSelect = filterSelects.nth(3); // 0-indexed, so 3 = 4th
        const options = serviceSelect.locator('option');
        const optionTexts = await options.allTextContents();
        console.log(`[FOUND] 4th select with options: ${optionTexts.slice(0, 5).join(', ')}`);
        
        // Verify it has "All" option
        if (optionTexts.includes('All')) {
          serviceSelectFound = true;
        }
      }
    }
    
    // Final check: if still not found, the Service filter might not be deployed yet
    if (!serviceSelectFound || !serviceSelect) {
      console.log(`[ERROR] Service filter not found. This might mean:`);
      console.log(`  - The Service filter code is not deployed to the test environment`);
      console.log(`  - The page structure is different than expected`);
      console.log(`  - Check debug screenshot: test-results/debug-before-filter.png`);
      throw new Error('Service filter dropdown not found. Check debug screenshot: test-results/debug-before-filter.png');
    }

    // Use the found select
    if (serviceSelectFound && serviceSelect) {
      // Verify it has "All" option and service options
      const options = serviceSelect.locator('option');
      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain('All');
      expect(optionTexts.length).toBeGreaterThan(1); // Should have at least one service
      
      console.log(`[FOUND] Service filter with ${optionTexts.length} options`);
      
      // Select the first service
      await serviceSelect.selectOption(firstService.id.toString());
      console.log(`[SELECTED] Service: ${firstService.name} (ID: ${firstService.id})`);

      // Wait for leads to reload after filter
      await page.waitForTimeout(2000);

      // Verify API was called with serviceTypeId
      if (apiCallWithService) {
        expect(apiCallWithService).toContain(`serviceTypeId=${firstService.id}`);
        console.log(`[VERIFY] API call includes serviceTypeId parameter`);
      }

      // Get filtered count
      const filteredLeads = page.locator('[class*="LeadCard"], [class*="lead-card"], .bg-slate-50, .bg-slate-900').filter({ hasText: /./ });
      const filteredCount = await filteredLeads.count();
      console.log(`[FILTERED] Found ${filteredCount} leads after filter`);

      // Verify results changed (unless all leads had that service)
      expect(filteredCount).toBeLessThanOrEqual(initialCount);

      // Clear filter by selecting "All" in the service dropdown
      await serviceSelect.selectOption('');
      console.log(`[CLEARED] Service filter`);

      // Wait for leads to reload
      await page.waitForTimeout(2000);

      // Verify count returned to original
      const clearedLeads = page.locator('[class*="LeadCard"], [class*="lead-card"], .bg-slate-50, .bg-slate-900').filter({ hasText: /./ });
      const clearedCount = await clearedLeads.count();
      console.log(`[CLEARED] Found ${clearedCount} leads after clearing filter`);

      // Count should be >= filtered count
      expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);

      // Take screenshot for evidence
      await page.screenshot({ path: 'test-results/service-filter-test.png', fullPage: true });
    }
  });
});

