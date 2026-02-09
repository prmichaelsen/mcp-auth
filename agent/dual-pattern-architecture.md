# Dual-Pattern Architecture: Server Wrapping + Tool-Level Auth

## Overview

`@prmichaelsen/mcp-auth` supports **two complementary patterns** for different use cases:

1. **Server Wrapping Pattern** - Wrap existing MCP servers without modification
2. **Tool-Level Auth Pattern** - Build new MCP servers with integrated auth

## When to Use Each Pattern

### Use Server Wrapping When:
- ✅ You want to add auth to an **existing MCP server** without modifying it
- ✅ You're building a **multi-tenant service** that wraps multiple MCP servers
- ✅ You want to **separate auth concerns** from business logic completely
- ✅ You need **server pooling** for performance

### Use Tool-Level Auth When:
- ✅ You're **building a new MCP server** from scratch
- ✅ You want **fine-grained control** over auth per tool
- ✅ You need **custom auth logic** for specific tools
- ✅ You want to **embed mcp-auth** directly in your server package

## Pattern 1: Server Wrapping (External Auth)

### Use Case: Wrapping Existing Servers

```typescript
// tenant-manager/server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer as createInstagramServer } from '@prmichaelsen/instagram-mcp';
import { createServer as createGitHubServer } from '@prmichaelsen/github-mcp';

// Wrap Instagram server
const instagramServer = wrapServer({
  serverFactory: (accessToken, userId) => createInstagramServer(accessToken, userId),
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000, basePath: '/instagram' }
});

// Wrap GitHub server
const githubServer = wrapServer({
  serverFactory: (accessToken, userId) => createGitHubServer(accessToken, userId),
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'github',
  transport: { type: 'sse', port: 3000, basePath: '/github' }
});

await Promise.all([
  instagramServer.start(),
  githubServer.start()
]);
```

**Benefits:**
- No modification to instagram-mcp or github-mcp packages
- Centralized auth management
- Server pooling for performance
- Easy to add/remove servers

## Pattern 2: Tool-Level Auth (Embedded Auth)

### Use Case: Building New Server with Integrated Auth

```typescript
// my-mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  AuthenticatedMCPServer, 
  withAuth,
  EnvAuthProvider,
  SimpleTokenResolver
} from '@prmichaelsen/mcp-auth';

// Create authenticated server
const server = new AuthenticatedMCPServer({
  name: 'my-mcp-server',
  version: '1.0.0',
  authProvider: new EnvAuthProvider(),
  tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'MY_API_TOKEN' }),
  resourceType: 'myapi',
  transport: { type: 'stdio' }
});

// Register tools with automatic auth injection
server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
  const client = new MyAPIClient(accessToken);
  return client.getData(args);
}));

server.registerTool('create_item', withAuth(async (args, accessToken, userId) => {
  const client = new MyAPIClient(accessToken);
  return client.createItem(args, userId);
}));

await server.start();
```

**Benefits:**
- Auth logic embedded in server package
- Fine-grained control per tool
- Can customize auth behavior per tool
- Self-contained package

## Hybrid Approach: Both Patterns Together

### Use Case: Server with Embedded Auth that Can Also Be Wrapped

```typescript
// my-mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { withAuth } from '@prmichaelsen/mcp-auth';
import { MyAPIClient } from './client.js';

/**
 * Factory function for external wrapping
 * @param accessToken - API access token
 * @param userId - User identifier
 */
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'my-mcp-server',
    version: '1.0.0'
  }, {
    capabilities: { tools: {} }
  });
  
  const client = new MyAPIClient(accessToken);
  
  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'get_data', description: 'Get data', inputSchema: {...} },
      { name: 'create_item', description: 'Create item', inputSchema: {...} }
    ]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'get_data':
        return { content: [{ type: 'text', text: await client.getData(args) }] };
      case 'create_item':
        return { content: [{ type: 'text', text: await client.createItem(args) }] };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
  
  return server;
}

/**
 * Create authenticated server with embedded auth
 * Useful for single-user or self-hosted scenarios
 */
export function createAuthenticatedServer(config: {
  authProvider?: AuthProvider;
  tokenResolver?: ResourceTokenResolver;
  transport?: TransportConfig;
}): AuthenticatedMCPServer {
  const server = new AuthenticatedMCPServer({
    name: 'my-mcp-server',
    version: '1.0.0',
    authProvider: config.authProvider || new EnvAuthProvider(),
    tokenResolver: config.tokenResolver || new SimpleTokenResolver({ tokenEnvVar: 'MY_API_TOKEN' }),
    resourceType: 'myapi',
    transport: config.transport || { type: 'stdio' }
  });
  
  // Register tools with auth
  server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
    const client = new MyAPIClient(accessToken);
    return client.getData(args);
  }));
  
  server.registerTool('create_item', withAuth(async (args, accessToken, userId) => {
    const client = new MyAPIClient(accessToken);
    return client.createItem(args, userId);
  }));
  
  return server;
}

/**
 * Stdio mode for single-user scenarios
 */
export async function startStdioServer() {
  const accessToken = process.env.MY_API_TOKEN;
  if (!accessToken) {
    throw new Error('MY_API_TOKEN environment variable required');
  }
  
  const server = createServer(accessToken);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Package exports:**
```json
{
  "name": "@myorg/my-mcp-server",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@prmichaelsen/mcp-auth": "^1.0.0"
  }
}
```

**Usage scenarios:**

```typescript
// Scenario 1: Single-user stdio (no external auth)
import { startStdioServer } from '@myorg/my-mcp-server';
await startStdioServer();

// Scenario 2: Self-hosted with embedded auth
import { createAuthenticatedServer } from '@myorg/my-mcp-server';
const server = createAuthenticatedServer({
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  transport: { type: 'sse', port: 3000 }
});
await server.start();

// Scenario 3: External wrapping (multi-tenant service)
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@myorg/my-mcp-server';
const wrapped = wrapServer({
  serverFactory: createServer,
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'myapi',
  transport: { type: 'sse', port: 3000 }
});
await wrapped.start();
```

## Tool-Level Auth API

### Basic Tool Registration

```typescript
import { AuthenticatedMCPServer, withAuth } from '@prmichaelsen/mcp-auth';

const server = new AuthenticatedMCPServer({
  name: 'my-server',
  authProvider: new EnvAuthProvider(),
  tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' }),
  resourceType: 'myapi',
  transport: { type: 'stdio' }
});

// Simple function-based tool
server.registerTool('get_profile', withAuth(async (args, accessToken, userId) => {
  const client = new APIClient(accessToken);
  return client.getProfile(args.userId);
}));
```

### Class-Based Tools

```typescript
import { Tool, AuthenticatedTool } from '@prmichaelsen/mcp-auth';

class GetProfileTool implements Tool {
  name = 'get_profile';
  description = 'Get user profile';
  inputSchema = {
    type: 'object',
    properties: {
      userId: { type: 'string' }
    }
  };
  
  async execute(args: { userId: string }, accessToken: string, userId: string) {
    const client = new APIClient(accessToken);
    return client.getProfile(args.userId);
  }
}

// Register class-based tool
server.registerTool(new AuthenticatedTool(new GetProfileTool()));
```

### Middleware Composition

```typescript
import { withAuth, withRateLimit, withLogging, compose } from '@prmichaelsen/mcp-auth';

const getTool = compose(
  withLogging({ level: 'info' }),
  withRateLimit({ maxRequests: 10, windowMs: 60000 }),
  withAuth(),
  async (args, accessToken, userId) => {
    const client = new APIClient(accessToken);
    return client.getData(args);
  }
);

server.registerTool('get_data', getTool);
```

### Conditional Auth

```typescript
import { withAuth } from '@prmichaelsen/mcp-auth';

// Public tool (no auth)
server.registerTool('get_public_info', async (args) => {
  return { info: 'This is public' };
});

// Authenticated tool
server.registerTool('get_private_info', withAuth(async (args, accessToken, userId) => {
  const client = new APIClient(accessToken);
  return client.getPrivateInfo(userId);
}));
```

### Custom Auth Per Tool

```typescript
import { withAuth } from '@prmichaelsen/mcp-auth';

// Tool with admin-only access
server.registerTool('admin_action', withAuth(async (args, accessToken, userId) => {
  // Custom auth check
  const user = await getUserInfo(userId);
  if (!user.isAdmin) {
    throw new Error('Admin access required');
  }
  
  const client = new APIClient(accessToken);
  return client.performAdminAction(args);
}));

// Tool with rate limiting per user
server.registerTool('expensive_operation', compose(
  withRateLimit({ 
    maxRequests: 5, 
    windowMs: 3600000, // 1 hour
    keyGenerator: (context) => context.userId // Rate limit per user
  }),
  withAuth(),
  async (args, accessToken, userId) => {
    const client = new APIClient(accessToken);
    return client.expensiveOperation(args);
  }
));
```

## Comparison Matrix

| Feature | Server Wrapping | Tool-Level Auth |
|---------|----------------|-----------------|
| **Modification Required** | None | Build with mcp-auth |
| **Auth Granularity** | Server-level | Per-tool |
| **Server Pooling** | Yes | No |
| **External Servers** | Yes | No |
| **Embedded Auth** | No | Yes |
| **Middleware** | Limited | Full support |
| **Custom Logic** | Limited | Full control |
| **Package Dependency** | None (external) | Required |
| **Best For** | Wrapping existing servers | Building new servers |

## Implementation Priority

### Phase 1: Core Infrastructure (Both Patterns)
1. Implement core types and auth provider interfaces
2. Implement authentication providers (JWT, OAuth, API Key)
3. Implement token resolvers

### Phase 2: Server Wrapping (Primary)
4. Implement `wrapServer()` function
5. Implement `AuthenticatedServerWrapper` class
6. Implement server pooling logic
7. Implement transport handlers

### Phase 3: Tool-Level Auth (Secondary)
8. Implement `AuthenticatedMCPServer` class
9. Implement `withAuth()` decorator
10. Implement `Tool` interface and `AuthenticatedTool` wrapper
11. Implement middleware composition (`compose()`, `withRateLimit()`, `withLogging()`)

### Phase 4: Examples
12. Create server wrapping example
13. Create tool-level auth example
14. Create hybrid example (both patterns)

## Recommended Exports

```typescript
// lib/mcp-auth/src/index.ts

// Server wrapping (primary pattern)
export { wrapServer } from './wrapper/index.js';
export type { ServerWrapperConfig } from './wrapper/config.js';

// Tool-level auth (secondary pattern)
export { AuthenticatedMCPServer } from './server/mcp-server.js';
export { withAuth } from './server/decorators.js';
export { Tool, AuthenticatedTool } from './server/tool.js';
export { compose, withRateLimit, withLogging } from './server/middleware.js';

// Auth providers (shared)
export type { AuthProvider, ResourceTokenResolver } from './auth/types.js';
export { EnvAuthProvider } from './auth/providers/env-provider.js';
export { JWTAuthProvider } from './auth/providers/jwt-provider.js';
export { OAuthProvider } from './auth/providers/oauth-provider.js';
export { APIKeyProvider } from './auth/providers/apikey-provider.js';

// Token resolvers (shared)
export { SimpleTokenResolver } from './auth/providers/simple-resolver.js';
export { DatabaseTokenResolver } from './auth/providers/database-resolver.js';

// Utilities (shared)
export { AuthError, TokenError } from './utils/errors.js';
export type { RequestContext, AuthResult } from './types.js';
```

## Summary

The dual-pattern architecture provides:

✅ **Server Wrapping** - Zero-modification approach for existing servers
✅ **Tool-Level Auth** - Fine-grained control for new servers
✅ **Hybrid Support** - Servers can support both patterns
✅ **Shared Infrastructure** - Auth providers and token resolvers work with both patterns
✅ **Flexibility** - Choose the right pattern for your use case
✅ **Gradual Adoption** - Start with one pattern, add the other later

Both patterns share the same authentication infrastructure (providers, token resolvers, transports), making the implementation efficient and maintainable.
