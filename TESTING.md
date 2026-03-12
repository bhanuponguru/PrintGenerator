# Testing Guide

This project uses **Vitest** for testing with an in-memory MongoDB server for database operations.

## Test Structure

```
__tests__/
├── helpers/
│   └── db-helpers.ts       # MongoDB test utilities
├── lib/
│   └── mongodb.test.ts     # Database connection tests
└── api/
    └── templates/
        ├── route.test.ts           # Tests for GET /api/templates and POST /api/templates
        └── [id]/
            └── route.test.ts       # Tests for GET, PUT, DELETE /api/templates/[id]
```

## Setup

All dependencies are already installed:
- `vitest` - Testing framework
- `@vitest/ui` - UI for running tests
- `mongodb-memory-server` - In-memory MongoDB for testing
- `happy-dom` - DOM environment for tests

## Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI interface
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Configuration

### vitest.config.ts
- Uses `happy-dom` for DOM environment
- Path aliases configured (`@/` maps to project root)
- 30-second timeout for MongoDB operations
- Setup file runs before all tests

### vitest.setup.ts
- Starts MongoDB Memory Server before all tests
- Sets environment variables (`MONGODB_URI`, `MONGODB_DB`)
- Cleans up connections after each test
- Stops MongoDB server after all tests

## Test Helpers

The `__tests__/helpers/db-helpers.ts` provides utilities:

- `clearDatabase()` - Remove all data from test database
- `createTestTemplate(overrides?)` - Create a single test template
- `createTestTemplates(count)` - Create multiple test templates
- `getTemplateById(id)` - Retrieve a template by ID
- `countTemplates()` - Count templates in database

## Test Coverage

### lib/mongodb.ts
✅ Connection establishment
✅ Connection caching
✅ Database operations
✅ Connection cleanup
✅ Error handling (missing environment variables)

### GET /api/templates
✅ List all templates
✅ Empty result set
✅ Sorting by `updated_on` (descending)
✅ Error handling

### POST /api/templates
✅ Create template with valid data
✅ Validation (name, version, template required)
✅ Type validation (must be correct types)
✅ Complex nested template objects
✅ Timestamp creation
✅ Error handling

### GET /api/templates/[id]
✅ Fetch by valid ID
✅ Invalid ObjectId format (400)
✅ Non-existent template (404)
✅ Error handling

### PUT /api/templates/[id]
✅ Update name, version, and template fields
✅ Update multiple fields at once
✅ Partial updates
✅ Timestamp updates (`updated_on` changes, `created_on` stays)
✅ Invalid ObjectId format (400)
✅ Non-existent template (404)
✅ Error handling

### DELETE /api/templates/[id]
✅ Delete existing template (hard delete)
✅ Invalid ObjectId format (400)
✅ Non-existent template (404)
✅ Verify deletion from database
✅ Error handling
