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

## Targeted Regression Runs

```bash
# Visual authoring flows (TemplateEditor)
npm test -- __tests__/ui/template-editor.test.tsx

# Visual generation flows (GenerateModal)
npm test -- __tests__/ui/generate-modal.test.tsx

# API generation route behavior
npm test -- __tests__/api/templates/[id]/generate/route.test.ts

# Runtime normalization and rendering behavior
npm test -- __tests__/lib/document-generation.test.ts __tests__/lib/document-generation-template-fill.test.ts
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

## Manual Premium UX QA Checklist

Run this checklist before sign-off on visual UX work:

1. Placeholder authoring in TemplateEditor
2. Create placeholders for list, repeat, custom, and table entirely through visual controls (no manual JSON required).
3. For repeat and custom kinds, verify token insertion buttons generate valid template output and preview content.
4. For table kind, verify header chips and grid edits remain consistent after adding/removing rows and columns.

1. Generation flow in GenerateModal
2. Fill list/repeat/table/custom placeholders through visual editors only.
3. Switch to JSON workspace and confirm values match visual edits.
4. Modify JSON, return to visual mode, and verify round-trip sync without data loss.

1. Accessibility and interaction checks
2. Keyboard navigation: tab through controls, trigger key actions with Enter/Space, and confirm visible focus states.
3. Validate aria labels/hints are present for token and table controls where applicable.
4. Confirm inline errors are understandable and appear near the associated controls.

1. Responsive checks
2. Test desktop and narrow viewport layouts for table/list/repeat editors.
3. Confirm action buttons remain reachable and grid/table areas are usable via horizontal scroll when constrained.

1. Output validation
2. Generate documents from at least two data points and verify output reflects all edited placeholder values.
3. Re-run `npm run test:run` to ensure no regressions across API, UI, and runtime tests.
