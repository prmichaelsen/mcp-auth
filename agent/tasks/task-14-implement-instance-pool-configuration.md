# Task 14: Implement Instance Pool Configuration

**Milestone**: Phase 14 - Feature Enhancements
**Estimated Time**: 6-8 hours
**Dependencies**: None (extends existing server wrapper)
**Status**: Not Started
**Created**: 2026-02-25
**Requested By**: playwright-mcp-server project

---

## Objective

Implement `instancePool` configuration support in `@prmichaelsen/mcp-auth` library to enable efficient instance pooling with configurable lifecycle management (maxSize, idleTimeout, maxLifetime).

---

## Context

The playwright-mcp-server project needs persistent instance pooling to optimize performance:
- **Current**: Ephemeral mode creates new browser on every request (2-5s latency)
- **Needed**: Pooled mode with instance reuse (50-100ms subsequent requests)
- **Blocker**: `instancePool` configuration doesn't exist in ServerWrapperConfig

**Current Error in Consuming Project**:
```
error TS2322: Object literal may only specify known properties, 
and 'instancePool' does not exist in type 'ServerWrapperConfig'.
```

**Desired API**:
```typescript
const wrappedServer = wrapServer({
  // ... other config ...
  instanceMode: 'pooled',
  instancePool: {
    maxSize: 10,              // Max concurrent instances
    idleTimeout: 300000,      // Close after 5 min idle
    maxLifetime: 3600000      // Force refresh after 1 hour
  }
});
```

---

## Steps

### 1. Update TypeScript Interfaces

**File**: [`src/types.ts`](../../src/types.ts:1)

Add `InstancePoolConfig` interface and update `ServerWrapperConfig`:

```typescript
/**
 * Instance pool configuration for pooled mode
 */
export interface InstancePoolConfig {
  /** Maximum number of concurrent instances */
  maxSize: number;
  
  /** Milliseconds before closing idle instance */
  idleTimeout: number;
  
  /** Milliseconds before forcing instance refresh */
  maxLifetime: number;
}

export interface ServerWrapperConfig {
  // ... existing properties ...
  
  /**
   * Instance lifecycle mode
   * - 'ephemeral': Create new instance per request (default, most secure)
   * - 'pooled': Reuse instances with lifecycle management
   */
  instanceMode?: 'ephemeral' | 'pooled';
  
  /**
   * Instance pool configuration (required when instanceMode is 'pooled')
   */
  instancePool?: InstancePoolConfig;
}
```

### 2. Create Instance Pool Manager

**File**: `src/wrapper/instance-pool-manager.ts` (new file)

Implement instance lifecycle management:

```typescript
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { InstancePoolConfig } from '../types.js';
import type { Logger } from '../utils/logger.js';

interface InstanceMetadata {
  server: Server;
  userId: string;
  accessToken: string;
  createdAt: number;
  lastUsed: number;
}

export class InstancePoolManager {
  private instances: Map<string, InstanceMetadata>;
  private config: InstancePoolConfig;
  private logger: Logger;
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(config: InstancePoolConfig, logger: Logger) {
    this.instances = new Map();
    this.config = config;
    this.logger = logger;
    this.startCleanupTimer();
  }
  
  async getInstance(
    userId: string,
    accessToken: string,
    factory: (accessToken: string, userId: string) => Server
  ): Promise<Server> {
    // Check if instance exists and is valid
    const existing = this.instances.get(userId);
    if (existing && this.isValid(existing)) {
      this.logger.debug('Reusing pooled instance', { userId });
      existing.lastUsed = Date.now();
      return existing.server;
    }
    
    // Remove invalid instance if exists
    if (existing) {
      this.logger.debug('Removing invalid instance', { userId });
      await this.removeInstance(userId);
    }
    
    // Check pool size limit
    if (this.instances.size >= this.config.maxSize) {
      this.logger.debug('Pool full, evicting LRU instance', { 
        size: this.instances.size,
        maxSize: this.config.maxSize
      });
      await this.evictLeastRecentlyUsed();
    }
    
    // Create new instance
    this.logger.debug('Creating new pooled instance', { userId });
    const server = factory(accessToken, userId);
    
    this.instances.set(userId, {
      server,
      userId,
      accessToken,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
    
    return server;
  }
  
  private isValid(instance: InstanceMetadata): boolean {
    const now = Date.now();
    const age = now - instance.createdAt;
    const idle = now - instance.lastUsed;
    
    const valid = age < this.config.maxLifetime && 
                  idle < this.config.idleTimeout;
    
    if (!valid) {
      this.logger.debug('Instance invalid', {
        userId: instance.userId,
        age,
        idle,
        maxLifetime: this.config.maxLifetime,
        idleTimeout: this.config.idleTimeout
      });
    }
    
    return valid;
  }
  
  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldestUserId: string | null = null;
    let oldestTime = Date.now();
    
    for (const [userId, instance] of this.instances.entries()) {
      if (instance.lastUsed < oldestTime) {
        oldestTime = instance.lastUsed;
        oldestUserId = userId;
      }
    }
    
    if (oldestUserId) {
      this.logger.info('Evicting LRU instance', { userId: oldestUserId });
      await this.removeInstance(oldestUserId);
    }
  }
  
  private async removeInstance(userId: string): Promise<void> {
    const instance = this.instances.get(userId);
    if (instance) {
      try {
        // Close server if it has a close method
        if ('close' in instance.server && typeof instance.server.close === 'function') {
          await instance.server.close();
        }
      } catch (error) {
        this.logger.error('Error closing instance', { userId, error });
      }
      this.instances.delete(userId);
    }
  }
  
  private startCleanupTimer(): void {
    // Run cleanup every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredInstances();
    }, 60000);
  }
  
  private async cleanupExpiredInstances(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [userId, instance] of this.instances.entries()) {
      if (!this.isValid(instance)) {
        toRemove.push(userId);
      }
    }
    
    if (toRemove.length > 0) {
      this.logger.info('Cleaning up expired instances', { count: toRemove.length });
      for (const userId of toRemove) {
        await this.removeInstance(userId);
      }
    }
  }
  
  async closeAll(): Promise<void> {
    this.logger.info('Closing all pooled instances', { count: this.instances.size });
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    const userIds = Array.from(this.instances.keys());
    for (const userId of userIds) {
      await this.removeInstance(userId);
    }
  }
  
  getStats() {
    return {
      size: this.instances.size,
      maxSize: this.config.maxSize,
      instances: Array.from(this.instances.values()).map(i => ({
        userId: i.userId,
        age: Date.now() - i.createdAt,
        idle: Date.now() - i.lastUsed
      }))
    };
  }
}
```

### 3. Update Server Wrapper Configuration

**File**: [`src/wrapper/config.ts`](../../src/wrapper/config.ts:1)

Add validation and normalization for instance pool config:

```typescript
import { validatePositiveNumber } from '../utils/validation.js';
import { ConfigurationError } from '../utils/errors.js';

export function normalizeConfig(config: ServerWrapperConfig): NormalizedServerWrapperConfig {
  // ... existing normalization ...
  
  // Validate instance pool config
  if (config.instanceMode === 'pooled') {
    if (!config.instancePool) {
      throw new ConfigurationError(
        'instancePool configuration required when instanceMode is "pooled"'
      );
    }
    
    validatePositiveNumber(config.instancePool.maxSize, 'instancePool.maxSize');
    validatePositiveNumber(config.instancePool.idleTimeout, 'instancePool.idleTimeout');
    validatePositiveNumber(config.instancePool.maxLifetime, 'instancePool.maxLifetime');
    
    if (config.instancePool.maxSize < 1) {
      throw new ConfigurationError('instancePool.maxSize must be at least 1');
    }
    
    if (config.instancePool.idleTimeout < 1000) {
      throw new ConfigurationError('instancePool.idleTimeout must be at least 1000ms (1 second)');
    }
    
    if (config.instancePool.maxLifetime < config.instancePool.idleTimeout) {
      throw new ConfigurationError('instancePool.maxLifetime must be >= idleTimeout');
    }
  }
  
  return normalized;
}
```

### 4. Integrate with Server Wrapper

**File**: [`src/wrapper/server-wrapper.ts`](../../src/wrapper/server-wrapper.ts:1)

Update `AuthenticatedServerWrapper` to use `InstancePoolManager`:

```typescript
import { InstancePoolManager } from './instance-pool-manager.js';

export class AuthenticatedServerWrapper {
  private poolManager?: InstancePoolManager;
  
  constructor(config: ServerWrapperConfig) {
    // ... existing initialization ...
    
    // Initialize pool manager if pooled mode
    if (this.config.instanceMode === 'pooled' && this.config.instancePool) {
      this.poolManager = new InstancePoolManager(
        this.config.instancePool,
        this.logger
      );
      
      this.logger.info('Instance pool manager initialized', {
        maxSize: this.config.instancePool.maxSize,
        idleTimeout: this.config.instancePool.idleTimeout,
        maxLifetime: this.config.instancePool.maxLifetime
      });
    }
  }
  
  private async getOrCreateServer(userId: string, accessToken: string): Promise<Server> {
    if (this.config.instanceMode === 'pooled' && this.poolManager) {
      // Use pool manager
      return this.poolManager.getInstance(userId, accessToken, this.config.serverFactory);
    } else {
      // Ephemeral mode (existing behavior)
      return this.config.serverFactory(accessToken, userId);
    }
  }
  
  async stop(): Promise<void> {
    this.logger.info('Stopping authenticated server wrapper');
    
    // Close pool manager if exists
    if (this.poolManager) {
      await this.poolManager.closeAll();
    }
    
    // ... existing cleanup ...
  }
}
```

### 5. Export New Types

**File**: [`src/wrapper/index.ts`](../../src/wrapper/index.ts:1)

Export new types and classes:

```typescript
export { InstancePoolManager } from './instance-pool-manager.js';
export type { InstancePoolConfig } from '../types.js';
```

### 6. Add Tests

**File**: `src/__tests__/instance-pool.test.ts` (new file)

Create comprehensive test suite:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstancePoolManager } from '../wrapper/instance-pool-manager.js';
import { createLogger } from '../utils/logger.js';

describe('InstancePoolManager', () => {
  let poolManager: InstancePoolManager;
  let mockFactory: vi.Mock;
  
  beforeEach(() => {
    mockFactory = vi.fn((accessToken, userId) => ({
      name: `server-${userId}`,
      close: vi.fn()
    }));
    
    poolManager = new InstancePoolManager({
      maxSize: 3,
      idleTimeout: 1000,
      maxLifetime: 5000
    }, createLogger({ level: 'error' }));
  });
  
  afterEach(async () => {
    await poolManager.closeAll();
  });
  
  it('should create new instance on first request', async () => {
    const server = await poolManager.getInstance('user1', 'token1', mockFactory);
    
    expect(mockFactory).toHaveBeenCalledTimes(1);
    expect(server.name).toBe('server-user1');
  });
  
  it('should reuse instance for same user', async () => {
    await poolManager.getInstance('user1', 'token1', mockFactory);
    await poolManager.getInstance('user1', 'token1', mockFactory);
    
    expect(mockFactory).toHaveBeenCalledTimes(1);
  });
  
  it('should enforce maxSize limit', async () => {
    await poolManager.getInstance('user1', 'token1', mockFactory);
    await poolManager.getInstance('user2', 'token2', mockFactory);
    await poolManager.getInstance('user3', 'token3', mockFactory);
    await poolManager.getInstance('user4', 'token4', mockFactory);
    
    const stats = poolManager.getStats();
    expect(stats.size).toBe(3); // maxSize
    expect(mockFactory).toHaveBeenCalledTimes(4);
  });
  
  // Add more tests...
});
```

### 7. Update Documentation

**File**: [`README.md`](../../README.md:1)

Add instance pool configuration section:

```markdown
## Instance Pooling

For performance-critical applications, enable instance pooling to reuse server instances:

```typescript
const wrapped = wrapServer({
  serverFactory: createServer,
  authProvider: new JWTAuthProvider({ jwtSecret: process.env.JWT_SECRET }),
  tokenResolver: new APITokenResolver({ /* ... */ }),
  resourceType: 'myapi',
  
  // Enable pooled mode
  instanceMode: 'pooled',
  instancePool: {
    maxSize: 10,              // Max 10 concurrent instances
    idleTimeout: 300000,      // Close after 5 min idle
    maxLifetime: 3600000      // Force refresh after 1 hour
  },
  
  transport: { type: 'sse', port: 3000 }
});
```

**When to use pooled mode:**
- ✅ Server initialization is expensive (e.g., browser launch, database connections)
- ✅ High request volume from same users
- ✅ Acceptable to share state between requests

**When to use ephemeral mode (default):**
- ✅ Maximum security (complete isolation)
- ✅ Stateless operations
- ✅ Low request volume
- ✅ Fast server initialization
```

### 8. Update CHANGELOG

**File**: [`CHANGELOG.md`](../../CHANGELOG.md:1)

Document new feature:

```markdown
## [7.2.0] - 2026-02-25

### Added

- **Instance Pool Configuration**: Added `instancePool` configuration to `ServerWrapperConfig`
  - Enables efficient instance reuse for performance-critical applications
  - Configurable pool size, idle timeout, and max lifetime
  - Automatic cleanup of expired instances
  - LRU eviction when pool is full
  - New `InstancePoolManager` class for lifecycle management
  - Backward compatible (ephemeral mode remains default)
```

### 9. Bump Version and Publish

Update version in [`package.json`](../../package.json:1):

```bash
# Update version
npm version minor  # 7.1.0 → 7.2.0

# Build
npm run build

# Publish
npm publish
```

---

## Verification

- [ ] `InstancePoolConfig` interface added to [`src/types.ts`](../../src/types.ts:1)
- [ ] `instancePool` property added to `ServerWrapperConfig`
- [ ] `InstancePoolManager` class implemented in `src/wrapper/instance-pool-manager.ts`
- [ ] `getInstance()` method works correctly
- [ ] Instance reuse working (factory called once per user)
- [ ] `maxSize` limit enforced
- [ ] Idle timeout cleanup working
- [ ] Max lifetime refresh working
- [ ] LRU eviction logic working
- [ ] Configuration validation added
- [ ] All tests passing
- [ ] TypeScript compiles without errors
- [ ] Documentation updated in README.md
- [ ] CHANGELOG.md updated
- [ ] Version bumped (7.1.0 → 7.2.0)
- [ ] Published to npm
- [ ] playwright-mcp-server can use new feature

---

## Expected Output

### Files Created
- `src/wrapper/instance-pool-manager.ts` - Instance pool manager implementation
- `src/__tests__/instance-pool.test.ts` - Test suite

### Files Modified
- [`src/types.ts`](../../src/types.ts:1) - Added `InstancePoolConfig` interface
- [`src/wrapper/config.ts`](../../src/wrapper/config.ts:1) - Added validation
- [`src/wrapper/server-wrapper.ts`](../../src/wrapper/server-wrapper.ts:1) - Integrated pool manager
- [`src/wrapper/index.ts`](../../src/wrapper/index.ts:1) - Exported new types
- [`README.md`](../../README.md:1) - Added instance pooling documentation
- [`CHANGELOG.md`](../../CHANGELOG.md:1) - Documented new feature
- [`package.json`](../../package.json:1) - Version bump to 7.2.0

---

## Common Issues and Solutions

### Issue 1: Pool size too small

**Symptom**: Frequent evictions, poor performance
**Solution**: Increase `maxSize` based on concurrent user count

### Issue 2: Memory leaks

**Symptom**: Memory usage grows over time
**Solution**: Ensure `maxLifetime` is set appropriately, check server cleanup

### Issue 3: Stale instances

**Symptom**: Errors from old instances
**Solution**: Reduce `idleTimeout` or `maxLifetime`

---

## Resources

- [Server Wrapping Pattern](../../agent/server-wrapping-pattern.md): Architecture documentation
- [Ephemeral vs Cached Instances](../../agent/ephemeral-vs-cached-instances.md): Design rationale
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk): Protocol reference

---

## Notes

- This is a new feature (minor version bump: 7.1.0 → 7.2.0)
- Backward compatible (`instancePool` is optional)
- Existing code using ephemeral mode unaffected
- Pooled mode without `instancePool` config throws error (fail-fast)
- Consider making `instancePool` required when `instanceMode` is 'pooled'
- Add comprehensive logging for debugging
- Document performance characteristics in README
- Benefits all MCP servers using mcp-auth, not just Playwright

---

**Next Task**: TBD
**Related Design Docs**: [Ephemeral vs Cached Instances](../../agent/ephemeral-vs-cached-instances.md)
**Estimated Completion Date**: TBD
