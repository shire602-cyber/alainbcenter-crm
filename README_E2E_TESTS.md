# E2E Test Suite - Production Verification

## Setup

Tests verify production fixes for:
1. **Leads page** - No React #310 error
2. **Inbox text messages** - Shows actual text, not "[Media message]"
3. **Audio media** - Correct headers and playback
4. **Image media** - Loads correctly
5. **PDF documents** - Opens with correct content-type

## Running Tests

### Prerequisites
```bash
npm install
npx playwright install --with-deps chromium
```

### Set Environment Variables
```bash
export E2E_BASE_URL=https://your-production-url.vercel.app
export E2E_EMAIL=admin@alainbcenter.com
export E2E_PASSWORD=your-password
```

### Run All Tests
```bash
npx playwright test
```

### Run Specific Test
```bash
npx playwright test e2e/test-a-leads-page.spec.ts
```

### View Results
```bash
npx playwright show-report
```

## Test Artifacts

- Screenshots: `test-results/*/test-failed-*.png`
- Videos: `test-results/*/video.webm`
- Traces: `test-results/*/trace.zip` (view with `npx playwright show-trace`)

## Current Status

⚠️ **IMPORTANT**: The deployment URL in the config may be outdated. 

**To fix:**
1. Get the correct production URL from Vercel dashboard
2. Set `E2E_BASE_URL` environment variable
3. Run tests: `E2E_BASE_URL=https://correct-url.vercel.app npx playwright test`

## Evidence Required

After fixes, provide:
1. Test output showing all tests passing
2. Screenshots of successful test runs
3. Playwright trace for any failures
4. Console output showing media headers (for audio/image/PDF tests)

