# Enhancement: Make tokenResolver Optional for Static Servers

**Priority**: 🟢 MEDIUM
**Status**: ✅ IMPLEMENTED
**Created**: 2026-02-11
**Implemented**: 2026-02-11
**Type**: Enhancement
**Actual Effort**: 2 hours

## Problem

Currently, `tokenResolver` is required in [`ServerWrapperConfig`](src/wrapper/config.ts:1), forcing users to provide a dummy resolver even when their MCP server manages its own data and doesn't need external credentials.

### Current Workaround

Users must use a dummy resolver:

```typescript
const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createMyServer(userId),
  authProvider: new JWTAuthProvider({ jwtSecret: process.env.JWT_SECRET }),
  tokenResolver: new SimpleTokenResolver({ tokens: { 'my-service': '' } }), // ❌ Dummy resolver
  resourceType: 'my-service',
  transport: { type: 'sse', port: 3000 }
});
```

## Proposed Solution

Make `tokenResolver` optional for static servers that only need `userId` from JWT validation.

### Use Cases

1. **Static MCP Servers**: Servers that manage their own data in a database
2. **User-Scoped Services**: Services where data is scoped by `userId` only
3. **Internal Tools**: Tools that don't require external API credentials
4. **Multi-Tenant SaaS**: Applications with user-specific data in own database

## Implementation

### 1. Update ServerWrapperConfig Type

**File**: [`src/wrapper/config.ts`](src/wrapper/config.ts:1)

```typescript
export interface ServerWrapperConfig {
  /**
   * Factory function to create MCP server instances
   */
  serverFactory: MCPServerFactory;
  
  /**
   * Authentication provider
   */
  authProvider: AuthProvider;
  
  /**
   * Token resolver (optional for static servers)
   * 
   * If not provided, the server factory will receive an empty string
   * as the accessToken parameter. This is useful for static servers
   * that manage their own data and only need the userId.
   * 
   * @example Static server (no external credentials)
   * ```typescript
   * {
   *   serverFactory: (accessToken, userId) => createMyServer(userId),
   *   authProvider: new JWTAuthProvider({ jwtSecret: '...' }),
   *   // tokenResolver omitted - static mode
   * }
   * ```
   * 
   * @example Dynamic server (with external credentials)
   * ```typescript
   * {
   *   serverFactory: (accessToken, userId) => createInstagramServer(accessToken),
   *   authProvider: new JWTAuthProvider({ jwtSecret: '...' }),
   *   tokenResolver: new APITokenResolver({ tenantManagerUrl: '...' })
   * }
   * ```
   */
  tokenResolver?: ResourceTokenResolver;
  
  /**
   * Resource type identifier
   * 
   * Used for logging and metrics. For static servers, this can be
   * any descriptive name (e.g., 'my-static-service').
   */
  resourceType: string;
  
  /**
   * Transport configuration
   */
  transport: TransportConfig;
  
  // ... other fields
}
```

### 2. Update Server Wrapper Implementation

**File**: [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts:1)

```typescript
private async getServerInstance(userId: string, accessToken: string): Promise<Server> {
  // Resolve resource token if resolver is configured
  let resourceToken: string;
  
  if (this.config.tokenResolver) {
    try {
      const token = await this.config.tokenResolver.resolveToken(
        userId,
        this.config.resourceType
      );
      
      if (!token) {
        throw new TokenResolutionError(userId, this.config.resourceType, {
          reason: 'Token resolver returned null'
        });
      }
      
      resourceToken = token;
      
      this.logger.debug('Token resolved', {
        userId,
        resourceType: this.config.resourceType,
        tokenLength: token.length
      });
    } catch (error) {
      this.logger.error('Token resolution failed', error as Error, {
        userId,
        resourceType: this.config.resourceType
      });
      throw error;
    }
  } else {
    // Static mode - no token resolution needed
    resourceToken = '';
    
    this.logger.debug('Static mode - no token resolution', {
      userId,
      resourceType: this.config.resourceType,
      mode: 'static'
    });
  }
  
  // Create server instance
  const server = await this.config.serverFactory(resourceToken, userId);
  
  return server;
}
```

### 3. Update Validation Logic

**File**: [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts:1)

```typescript
private validateConfig(config: ServerWrapperConfig): void {
  if (!config.serverFactory) {
    throw new ConfigurationError('serverFactory is required');
  }
  
  if (!config.authProvider) {
    throw new ConfigurationError('authProvider is required');
  }
  
  // tokenResolver is now optional
  if (config.tokenResolver) {
    this.logger.info('Token resolver configured - dynamic mode', {
      resolverType: config.tokenResolver.constructor.name
    });
  } else {
    this.logger.info('No token resolver - static mode', {
      note: 'Server factory will receive empty string as accessToken'
    });
  }
  
  if (!config.resourceType) {
    throw new ConfigurationError('resourceType is required');
  }
  
  // ... rest of validation
}
```

### 4. Update Initialization Logging

```typescript
async initialize(): Promise<void> {
  this.logger.info('Initializing server wrapper', {
    name: this.config.name,
    version: this.config.version,
    resourceType: this.config.resourceType,
    mode: this.config.tokenResolver ? 'dynamic' : 'static',
    transport: this.config.transport.type
  });
  
  // Initialize auth provider
  await this.config.authProvider.initialize();
  
  // Initialize token resolver if configured
  if (this.config.tokenResolver) {
    await this.config.tokenResolver.initialize();
  }
}
```

## Benefits

1. **Cleaner API**: No need for dummy resolvers
2. **Better DX**: More intuitive for static server use cases
3. **Explicit Intent**: Code clearly shows static vs dynamic mode
4. **Performance**: Skip unnecessary token resolution for static servers
5. **Flexibility**: Supports both patterns seamlessly

## Examples

### Static Server (No External Credentials)

```typescript
import { wrapServer, JWTAuthProvider } from '@prmichaelsen/mcp-auth';

const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => {
    // accessToken will be empty string - use userId only
    return createMyStaticServer(userId);
  },
  
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.JWT_SECRET
  }),
  
  // ✅ No tokenResolver needed!
  
  resourceType: 'my-static-service',
  
  transport: {
    type: 'sse',
    port: 3000,
    cors: true,
    corsOrigin: process.env.CORS_ORIGIN
  }
});
```

### Dynamic Server (With External Credentials)

```typescript
import { wrapServer, JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';

const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => {
    // accessToken contains Instagram token from API
    return createInstagramServer(accessToken);
  },
  
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.JWT_SECRET
  }),
  
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: process.env.TENANT_MANAGER_URL,
    serviceToken: process.env.SERVICE_TOKEN
  }),
  
  resourceType: 'instagram',
  
  transport: {
    type: 'sse',
    port: 3000,
    cors: true,
    corsOrigin: process.env.CORS_ORIGIN
  }
});
```

## Testing

```typescript
describe('Optional Token Resolver', () => {
  it('should work without token resolver (static mode)', async () => {
    const wrapper = new AuthenticatedServerWrapper({
      serverFactory: (accessToken, userId) => {
        expect(accessToken).toBe('');
        expect(userId).toBe('test-user');
        return createMockServer();
      },
      authProvider: new MockAuthProvider('test-user'),
      // No tokenResolver
      resourceType: 'static-service',
      transport: { type: 'stdio' }
    });
    
    await wrapper.start();
    // Should work without errors
  });
  
  it('should work with token resolver (dynamic mode)', async () => {
    const wrapper = new AuthenticatedServerWrapper({
      serverFactory: (accessToken, userId) => {
        expect(accessToken).toBe('resolved-token');
        expect(userId).toBe('test-user');
        return createMockServer();
      },
      authProvider: new MockAuthProvider('test-user'),
      tokenResolver: new MockTokenResolver('resolved-token'),
      resourceType: 'dynamic-service',
      transport: { type: 'stdio' }
    });
    
    await wrapper.start();
    // Should resolve token and pass to factory
  });
});
```

## Documentation Updates

### README.md

Add section explaining static vs dynamic modes:

```markdown
## Static vs Dynamic Servers

### Static Servers (No External Credentials)

For servers that manage their own data and only need user identification:

```typescript
const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createMyServer(userId),
  authProvider: new JWTAuthProvider({ jwtSecret: '...' }),
  // No tokenResolver needed
  resourceType: 'my-service',
  transport: { type: 'sse', port: 3000 }
});
```

### Dynamic Servers (With External Credentials)

For servers that need external API tokens (Instagram, GitHub, etc.):

```typescript
const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createInstagramServer(accessToken),
  authProvider: new JWTAuthProvider({ jwtSecret: '...' }),
  tokenResolver: new APITokenResolver({ tenantManagerUrl: '...' }),
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});
```
```

## Breaking Changes

**None** - This is a backward-compatible enhancement. Existing code with `tokenResolver` will continue to work.

## Timeline

- **Target**: v8.0.0 or v7.1.0
- **Estimated Effort**: 2-3 hours
- **Priority**: Medium (nice-to-have improvement)

## Acceptance Criteria

- [ ] `tokenResolver` is optional in `ServerWrapperConfig`
- [ ] Server wrapper handles missing `tokenResolver` gracefully
- [ ] Empty string passed to `serverFactory` when no resolver
- [ ] Validation updated to allow missing `tokenResolver`
- [ ] Initialization skips resolver setup when not configured
- [ ] Logging indicates static vs dynamic mode
- [ ] Tests added for both modes
- [ ] Documentation updated with examples
- [ ] README updated with static vs dynamic section
- [ ] No breaking changes to existing code

## Related

- Use case discussion: User question about static servers
- Pattern: JWT validation only, no external credentials
- Architecture: Ephemeral instances with user isolation
