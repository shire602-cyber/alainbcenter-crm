# Testing (Guaranteed)

This project uses a reliable test database setup that ensures tests pass consistently.

## Prerequisites

1. **Set TEST_DATABASE_URL** (required):
   ```bash
   export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/test_db"
   ```
   
   Or add to `.env.test`:
   ```
   TEST_DATABASE_URL=postgresql://user:password@localhost:5432/test_db
   ```

2. **Create test database** (if it doesn't exist):
   ```bash
   createdb test_db  # PostgreSQL
   ```

## Running Tests

### Standard Test Run
```bash
npm test
```

This will:
1. Validate TEST_DATABASE_URL is set
2. Ensure test database is ready
3. Run all tests with vitest

### Reset Test Database
```bash
npm run test:db:reset
```

This resets the test database (drops schema, recreates, applies migrations).

### Setup Test Database Only
```bash
npm run test:db:setup
```

This ensures the test database schema is up to date without resetting.

## Test Database Strategy

We use **migrate reset** strategy for reliability:
- Drops all tables
- Recreates schema from scratch
- Applies all migrations in order
- Ensures clean state for every test run

## Test Configuration

- **Serial execution**: Tests run in order (no shuffling) for reliability
- **Limited workers**: Max 2 threads to avoid database conflicts
- **Timeout**: 30 seconds per test
- **Setup file**: `tests/setup.ts` validates TEST_DATABASE_URL before any tests run

## Troubleshooting

### "TEST_DATABASE_URL is required"
- Set the environment variable before running tests
- Check `.env.test` file exists and has the correct value

### "Test database setup failed"
- Ensure PostgreSQL is running
- Check database credentials are correct
- Verify database exists: `psql -l | grep test_db`

### Tests are slow
- Reduce `VITEST_MAX_THREADS` in vitest.config.ts
- Or set `TEST_RESET_BEFORE_EACH=false` to avoid resetting between suites

### Migration errors
- Run `npm run test:db:reset` to start fresh
- Check migrations are valid: `npx prisma migrate status --schema=prisma/schema.prisma`

## Best Practices

1. **Always use TEST_DATABASE_URL** - Never use dev/prod database for tests
2. **Reset between major changes** - Run `npm run test:db:reset` after schema changes
3. **Keep tests isolated** - Each test should clean up after itself
4. **Use getTestPrisma()** - Always use the test DB helper, never the main prisma client

## Example Test

```typescript
import { getTestPrisma } from '@/lib/test/db'

describe('My Feature', () => {
  const prisma = getTestPrisma()
  
  it('should work', async () => {
    // Test code here
    const result = await prisma.lead.findMany()
    expect(result).toBeDefined()
  })
})
```

