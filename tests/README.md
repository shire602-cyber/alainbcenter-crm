# Anti-Duplicate Test Suite

Complete test suite for WhatsApp autopilot idempotency and flow state management.

## Quick Start

### 1. Setup Test Database

```bash
# Option A: Use separate test database
export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"

# Option B: Use main DB with _test suffix (not recommended for production)
export TEST_DATABASE_URL="${DATABASE_URL}_test"
```

### 2. Run Migrations

```bash
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
```

### 3. Run Tests

```bash
# All tests
npm test

# Unit tests only
npm test -- tests/flow-engine.unit.test.ts

# Integration tests only
npm test -- tests/whatsapp-dedupe.integration.test.ts

# With coverage
npm run test:coverage
```

## Test Structure

### Unit Tests (`tests/flow-engine.unit.test.ts`)
- Flow state persistence
- Question repeat prevention
- Time window validation
- Data collection and merging

### Integration Tests (`tests/whatsapp-dedupe.integration.test.ts`)
- Single inbound => single outbound
- Duplicate webhook handling
- Concurrency tests
- Echo/status message filtering
- Flow anti-repeat (real bug repro)

### Test Helpers

- **`helpers/metaPayloadBuilder.ts`**: Build Meta webhook payloads
- **`helpers/testDb.ts`**: Test database setup and cleanup
- **`helpers/mockWhatsApp.ts`**: Mock WhatsApp send function

## Test Coverage

✅ Inbound idempotency (hard dedupe)
✅ Outbound idempotency (one reply per inbound)
✅ Flow state persistence
✅ Question repeat prevention
✅ Concurrency safety
✅ Database constraint enforcement

## CI/CD

Tests run automatically on push/PR via GitHub Actions (`.github/workflows/test-idempotency.yml`).

## Manual Testing

See `docs/anti-duplicate-test-runbook.md` for manual end-to-end testing instructions.

