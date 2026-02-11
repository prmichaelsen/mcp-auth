# Implement Comprehensive Test Suite

**Priority**: 🟡 HIGH  
**Status**: Open  
**Created**: 2026-02-11  
**Phase**: Phase 10 - Testing & Documentation  
**Estimated Effort**: 16-20 hours

## Overview

Implement a comprehensive test suite for `@prmichaelsen/mcp-auth` following the patterns from `firebase-admin-sdk-v8`. The suite will include unit tests (mocked) and e2e tests (real integration).

## Goals

1. **Unit Tests**: Fast, isolated tests with mocked dependencies
2. **E2E Tests**: Integration tests against real MCP servers
3. **Coverage**: Achieve 80%+ code coverage
4. **CI/CD Ready**: Tests run in GitHub Actions
5. **Documentation**: Clear test patterns for contributors

## Test Structure

Based on `firebase-admin-sdk-v8` patterns:

```
src/
├── auth/
│   ├── base-provider.ts
│   ├── base-provider.spec.ts          # Unit tests
│   ├── providers/
│   │   ├── env-provider.ts
│   │   ├── env-provider.spec.ts       # Unit tests
│   │   ├── jwt-provider.ts
│   │   ├── jwt-provider.spec.ts       # Unit tests
│   │   ├── jwt-provider.e2e.ts        # E2E tests
│   │   ├── api-token-resolver.ts
│   │   ├── api-token-resolver.spec.ts # Unit tests
│   │   └── api-token-resolver.e2e.ts  # E2E tests
├── wrapper/
│   ├── server-wrapper.ts
│   ├── server-wrapper.spec.ts         # Unit tests
│   └── server-wrapper.e2e.ts          # E2E tests
├── server/
│   ├── mcp-server.ts
│   ├── mcp-server.spec.ts             # Unit tests
│   ├── mcp-server.e2e.ts              # E2E tests
│   ├── decorators.ts
│   └── decorators.spec.ts             # Unit tests
├── utils/
│   ├── errors.spec.ts                 # Unit tests
│   ├── logger.spec.ts                 # Unit tests
│   └── validation.spec.ts             # Unit tests
└── __tests__/
    ├── helpers/                        # Test utilities
    │   ├── mock-server.ts             # Mock MCP server
    │   ├── mock-providers.ts          # Mock auth providers
    │   └── test-utils.ts              # Common test helpers
    └── fixtures/                       # Test data
        ├── valid-jwt.json
        ├── invalid-jwt.json
        └── mock-credentials.json
```

## Configuration Files

### 1. jest.config.js (Unit Tests)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.e2e.ts',
    '!src/index.ts',              // Barrel export only
    '!src/types.ts',              // Type definitions only
    '!src/auth/types.ts',         // Type definitions only
    '!src/auth/index.ts',         // Barrel export only
    '!src/wrapper/index.ts',      // Barrel export only
    '!src/server/index.ts',       // Barrel export only
    '!src/utils/index.ts',        // Barrel export only
    '!src/tenant/index.ts',       // Barrel export only
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### 2. jest.e2e.config.js (E2E Tests)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.e2e.ts'],
  testTimeout: 30000, // 30 seconds for real API calls
  roots: ['<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.e2e.ts',
    '!src/types.ts',
    '!src/index.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.e2e.ts'],
};
```

### 3. package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config jest.e2e.config.js",
    "test:e2e:watch": "jest --config jest.e2e.config.js --watch",
    "test:all": "npm test && npm run test:e2e",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

## Test Categories

### Category 1: Core Types & Utilities (8 test files)

**Priority**: HIGH  
**Estimated**: 3-4 hours

- [ ] `src/utils/errors.spec.ts` - Error classes and formatting
- [ ] `src/utils/logger.spec.ts` - Logging and sanitization
- [ ] `src/utils/validation.spec.ts` - Input validation functions
- [ ] `src/auth/base-provider.spec.ts` - Base provider caching

**Coverage Target**: 90%+

### Category 2: Authentication Providers (10 test files)

**Priority**: HIGH  
**Estimated**: 5-6 hours

#### Unit Tests (Mocked)
- [ ] `src/auth/providers/env-provider.spec.ts`
- [ ] `src/auth/providers/jwt-provider.spec.ts`
- [ ] `src/auth/providers/simple-resolver.spec.ts`
- [ ] `src/auth/providers/jwt-token-resolver.spec.ts`
- [ ] `src/auth/providers/api-token-resolver.spec.ts`

#### E2E Tests (Real Integration)
- [ ] `src/auth/providers/jwt-provider.e2e.ts`
- [ ] `src/auth/providers/api-token-resolver.e2e.ts`

**Coverage Target**: 85%+

### Category 3: Server Wrapping (4 test files)

**Priority**: CRITICAL  
**Estimated**: 4-5 hours

- [ ] `src/wrapper/server-wrapper.spec.ts` - Unit tests with mocked MCP server
- [ ] `src/wrapper/server-wrapper.e2e.ts` - E2E with real MCP server
- [ ] `src/wrapper/config.spec.ts` - Configuration validation

**Test Scenarios**:
- Ephemeral instance creation
- JWT authentication flow
- Token resolution
- CORS security validation (NEW - v5.0.0)
- Error handling
- Server pooling (if implemented)

**Coverage Target**: 85%+

### Category 4: Tool-Level Auth (6 test files)

**Priority**: HIGH  
**Estimated**: 4-5 hours

- [ ] `src/server/mcp-server.spec.ts` - Unit tests
- [ ] `src/server/mcp-server.e2e.ts` - E2E tests
- [ ] `src/server/decorators.spec.ts` - Middleware composition
- [ ] `src/server/tool.spec.ts` - Tool wrapping

**Test Scenarios**:
- Tool registration
- withAuth decorator
- Middleware composition (withLogging, withRateLimit, withTimeout, withRetry)
- Error handling
- Tool execution with auth

**Coverage Target**: 85%+

### Category 5: Integration Tests (2 test files)

**Priority**: MEDIUM  
**Estimated**: 2-3 hours

- [ ] `src/__tests__/integration/full-flow.e2e.ts` - Complete auth flow
- [ ] `src/__tests__/integration/multi-tenant.e2e.ts` - Multi-user scenarios

**Test Scenarios**:
- End-to-end authentication flow
- Multiple users with different credentials
- Token refresh scenarios
- Error recovery

**Coverage Target**: N/A (integration tests)

## Test Helpers & Utilities

### 1. Mock MCP Server

```typescript
// src/__tests__/helpers/mock-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export function createMockServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'mock-server',
    version: '1.0.0',
  });
  
  // Register mock tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'mock_tool', description: 'Mock tool', inputSchema: { type: 'object' } }
    ]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => ({
    content: [{ type: 'text', text: `Mock response for ${userId}` }]
  }));
  
  return server;
}
```

### 2. Mock Auth Providers

```typescript
// src/__tests__/helpers/mock-providers.ts
export class MockAuthProvider implements AuthProvider {
  constructor(private userId: string = 'test-user') {}
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    return {
      success: true,
      userId: this.userId,
      metadata: {}
    };
  }
  
  async validate(): Promise<boolean> {
    return true;
  }
}

export class MockTokenResolver implements ResourceTokenResolver {
  constructor(private token: string = 'mock-token') {}
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    return this.token;
  }
}
```

### 3. Test Utilities

```typescript
// src/__tests__/helpers/test-utils.ts
export function createMockRequestContext(overrides?: Partial<RequestContext>): RequestContext {
  return {
    headers: { authorization: 'Bearer mock-token' },
    transport: 'stdio',
    timestamp: new Date(),
    ...overrides
  };
}

export function createValidJWT(payload: Record<string, unknown>): string {
  // Helper to create valid JWT for testing
}

export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Example Test Files

### Unit Test Example: jwt-provider.spec.ts

```typescript
/**
 * Unit tests for JWTAuthProvider
 * Tests JWT verification with mocked dependencies
 */

import { JWTAuthProvider } from './jwt-provider';
import { createMockRequestContext } from '../../__tests__/helpers/test-utils';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

describe('JWTAuthProvider', () => {
  let provider: JWTAuthProvider;
  
  beforeEach(() => {
    jest.clearAllMocks();
    provider = new JWTAuthProvider({
      jwtSecret: 'test-secret'
    });
  });
  
  describe('authenticate', () => {
    it('should successfully authenticate valid JWT', async () => {
      const context = createMockRequestContext({
        headers: { authorization: 'Bearer valid-token' }
      });
      
      const result = await provider.authenticate(context);
      
      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
    });
    
    it('should fail with missing authorization header', async () => {
      const context = createMockRequestContext({
        headers: {}
      });
      
      const result = await provider.authenticate(context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authorization header');
    });
    
    it('should cache authentication results', async () => {
      const context = createMockRequestContext();
      
      await provider.authenticate(context);
      await provider.authenticate(context);
      
      // Verify JWT verification was called only once (cached)
      expect(jwt.verify).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('CORS Security (v5.0.0)', () => {
    it('should validate CORS origin configuration', () => {
      // Test CORS validation logic
    });
  });
});
```

### E2E Test Example: server-wrapper.e2e.ts

```typescript
/**
 * E2E tests for Server Wrapping
 * Tests against real MCP server instances
 */

import { wrapServer } from './server-wrapper';
import { JWTAuthProvider } from '../auth/providers/jwt-provider';
import { SimpleTokenResolver } from '../auth/providers/simple-resolver';
import { createMockServer } from '../__tests__/helpers/mock-server';

describe('Server Wrapper E2E', () => {
  let wrapped: any;
  
  beforeAll(async () => {
    wrapped = wrapServer({
      serverFactory: createMockServer,
      authProvider: new JWTAuthProvider({
        jwtSecret: process.env.TEST_JWT_SECRET || 'test-secret'
      }),
      tokenResolver: new SimpleTokenResolver({
        tokens: { 'test-api': 'test-token' }
      }),
      resourceType: 'test-api',
      transport: { type: 'stdio' }
    });
    
    await wrapped.start();
  });
  
  afterAll(async () => {
    await wrapped.stop();
  });
  
  it('should create ephemeral server instances', async () => {
    // Test ephemeral instance creation
  });
  
  it('should enforce CORS security in production', async () => {
    process.env.NODE_ENV = 'production';
    
    expect(() => {
      wrapServer({
        serverFactory: createMockServer,
        authProvider: new JWTAuthProvider({ jwtSecret: 'secret' }),
        tokenResolver: new SimpleTokenResolver({}),
        resourceType: 'test',
        transport: { type: 'sse', cors: true, corsOrigin: '*' }
      });
    }).toThrow('CORS wildcard not allowed in production');
  });
});
```

## Dependencies

Add to `package.json`:

```json
{
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.6"
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [mainline, develop]
  pull_request:
    branches: [mainline]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
  
  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e
        env:
          TEST_JWT_SECRET: ${{ secrets.TEST_JWT_SECRET }}
```

## Implementation Plan

### Phase 1: Setup (2 hours)
1. Install Jest and dependencies
2. Create jest.config.js and jest.e2e.config.js
3. Create test helpers and utilities
4. Setup GitHub Actions workflow

### Phase 2: Core Tests (4 hours)
1. Implement utils tests (errors, logger, validation)
2. Implement base-provider tests
3. Achieve 90%+ coverage for utilities

### Phase 3: Auth Provider Tests (6 hours)
1. Implement unit tests for all providers
2. Implement E2E tests for JWT and API resolvers
3. Test CORS security validation (v5.0.0)
4. Achieve 85%+ coverage

### Phase 4: Server Tests (5 hours)
1. Implement server-wrapper unit tests
2. Implement server-wrapper E2E tests
3. Implement mcp-server tests
4. Implement decorator tests
5. Achieve 85%+ coverage

### Phase 5: Integration Tests (3 hours)
1. Implement full-flow E2E tests
2. Implement multi-tenant scenarios
3. Test error recovery

## Success Criteria

- [ ] All unit tests passing
- [ ] All E2E tests passing
- [ ] 80%+ overall code coverage
- [ ] 90%+ coverage for utilities
- [ ] 85%+ coverage for core modules
- [ ] CI/CD pipeline green
- [ ] Test documentation complete
- [ ] CORS security tests included (v5.0.0)

## Breaking Changes Testing

Ensure tests cover v5.0.0 breaking changes:

- [ ] CORS wildcard blocked in production
- [ ] corsOrigin required when cors: true
- [ ] Development wildcard logs warning
- [ ] Explicit origins work correctly

## Documentation

Create `TESTING.md`:

```markdown
# Testing Guide

## Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# All tests
npm run test:all

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Writing Tests

### Unit Tests
- Use `.spec.ts` extension
- Mock external dependencies
- Test isolated functionality
- Fast execution (<100ms per test)

### E2E Tests
- Use `.e2e.ts` extension
- Test real integrations
- May require credentials
- Longer execution (seconds)

## Test Patterns

[Include examples from this document]
```

## References

- Firebase Admin SDK v8 tests: `/home/prmichaelsen/firebase-admin-sdk-v8/src/`
- Jest documentation: https://jestjs.io/
- ts-jest documentation: https://kulshekhar.github.io/ts-jest/

## Related Tasks

- Phase 10: Testing & Documentation
- Security Audit #001 (validate CORS fixes)

## Notes

- Tests should be written alongside implementation (TDD preferred)
- E2E tests require real credentials (use environment variables)
- Coverage thresholds enforced in CI/CD
- CORS security tests are critical for v5.0.0 validation
