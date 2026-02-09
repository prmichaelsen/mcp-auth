# Server Wrapping Pattern for lib/mcp-auth

## Overview

Instead of requiring MCP server authors to wrap individual tools with authentication, `lib/mcp-auth` should be able to wrap an entire MCP server instance, automatically injecting authentication into all tool calls without requiring any changes to the underlying server code.

## Design Goals

1. **Zero modification**: Existing MCP servers work without any code changes
2. **Transparent wrapping**: Auth is injected at the server level, not tool level
3. **Standard interface**: Works with any properly exported MCP server
4. **Backward compatible**: Supports both wrapped and unwrapped modes
5. **Type-safe**: Full TypeScript support

## Core Concept

```typescript
// Existing MCP server (no auth awareness)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export function createInstagramServer(accessToken: string) {
  const server = new Server({
    name: 'instagram-mcp',
    version: '1.0.0'
  });
  
  // Register tools normally
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: 'get_profile', description: 'Get profile', inputSchema: {...} },
      { name: 'get_media', description: 'Get media', inputSchema: {...} }
    ]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Uses accessToken from closure
    const client = new InstagramClient(accessToken);
    
    if (name === 'get_profile') {
      return { content: [{ type: 'text', text: await client.getProfile(args) }] };
    }
    // ... other tools
  });
  
  return server;
}

// With mcp-auth wrapper (multi-tenant)
import { wrapServer } from '@prmichaelsen/mcp-auth';

const wrappedServer = wrapServer({
  // Factory function that creates server instance per request
  serverFactory: (accessToken: string, userId: string) => {
    return createInstagramServer(accessToken);
  },
  
  // Auth configuration
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'instagram',
  
  // Transport
  transport: { type: 'sse', port: 3000 }
});

await wrappedServer.start();
```

## Architecture

### Pattern 1: Server Factory Pattern (Recommended)

The MCP server exports a **factory function** that accepts an access token and returns a configured server instance.

```typescript
// instagram-mcp/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InstagramClient } from './client.js';

/**
 * Factory function that creates an Instagram MCP server
 * @param accessToken - Instagram access token for API calls
 * @returns Configured MCP server instance
 */
export function createServer(accessToken: string): Server {
  const server = new Server({
    name: 'instagram-mcp',
    version: '1.0.0'
  }, {
    capabilities: { tools: {} }
  });
  
  const client = new InstagramClient(accessToken);
  
  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'instagram_get_profile',
        description: 'Get Instagram profile information',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Instagram user ID' }
          },
          required: ['userId']
        }
      },
      {
        name: 'instagram_get_media',
        description: 'Get user media',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            limit: { type: 'number' }
          }
        }
      }
    ]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'instagram_get_profile':
        const profile = await client.getProfile(args.userId);
        return {
          content: [{ type: 'text', text: JSON.stringify(profile) }]
        };
        
      case 'instagram_get_media':
        const media = await client.getMedia(args.userId, args.limit);
        return {
          content: [{ type: 'text', text: JSON.stringify(media) }]
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
  
  return server;
}

// For single-user stdio mode (backward compatible)
export async function startStdioServer() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN environment variable required');
  }
  
  const server = createServer(accessToken);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Package exports:**
```json
{
  "name": "@prmichaelsen/instagram-mcp",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "default": "./dist/server.js"
    }
  }
}
```

### Pattern 2: Server Instance Cloning (Alternative)

For servers that don't export a factory, we can clone/recreate the server per request.

```typescript
// instagram-mcp/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export class InstagramMCPServer {
  private client: InstagramClient;
  
  constructor(accessToken: string) {
    this.client = new InstagramClient(accessToken);
  }
  
  /**
   * Create and configure the MCP server
   */
  createServer(): Server {
    const server = new Server({
      name: 'instagram-mcp',
      version: '1.0.0'
    }, {
      capabilities: { tools: {} }
    });
    
    // Register handlers
    this.registerHandlers(server);
    
    return server;
  }
  
  private registerHandlers(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions()
    }));
    
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request);
    });
  }
  
  private getToolDefinitions() {
    return [
      {
        name: 'instagram_get_profile',
        description: 'Get Instagram profile',
        inputSchema: { /* ... */ }
      }
    ];
  }
  
  private async handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'instagram_get_profile':
        return this.getProfile(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  
  private async getProfile(args: any) {
    const profile = await this.client.getProfile(args.userId);
    return {
      content: [{ type: 'text', text: JSON.stringify(profile) }]
    };
  }
}

// Factory function for mcp-auth
export function createServer(accessToken: string): Server {
  const instance = new InstagramMCPServer(accessToken);
  return instance.createServer();
}
```

## mcp-auth Implementation

### Core Wrapper API

```typescript
// lib/mcp-auth/src/wrapper/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import type { TransportConfig } from '../server/config.js';

export interface ServerWrapperConfig {
  /**
   * Factory function that creates a server instance for a specific user
   * @param accessToken - Resource-specific access token (e.g., Instagram token)
   * @param userId - Authenticated user ID
   * @returns Configured MCP server instance
   */
  serverFactory: (accessToken: string, userId: string) => Server | Promise<Server>;
  
  /**
   * Authentication provider
   */
  authProvider: AuthProvider;
  
  /**
   * Token resolver for resource-specific tokens
   */
  tokenResolver: ResourceTokenResolver;
  
  /**
   * Resource type (e.g., 'instagram', 'github')
   */
  resourceType: string;
  
  /**
   * Transport configuration
   */
  transport: TransportConfig;
  
  /**
   * Optional: Server pooling configuration
   */
  pooling?: {
    enabled: boolean;
    maxServersPerUser?: number;
    idleTimeoutMs?: number;
  };
  
  /**
   * Optional: Middleware
   */
  middleware?: {
    rateLimit?: RateLimitConfig;
    logging?: LoggingConfig;
  };
}

/**
 * Wrap an MCP server with authentication
 */
export function wrapServer(config: ServerWrapperConfig): AuthenticatedServerWrapper {
  return new AuthenticatedServerWrapper(config);
}

/**
 * Authenticated server wrapper that manages per-user server instances
 */
export class AuthenticatedServerWrapper {
  private config: ServerWrapperConfig;
  private serverPool: Map<string, ServerInstance>;
  
  constructor(config: ServerWrapperConfig) {
    this.config = config;
    this.serverPool = new Map();
  }
  
  /**
   * Start the wrapped server
   */
  async start(): Promise<void> {
    await this.config.authProvider.initialize?.();
    
    // Start transport based on config
    switch (this.config.transport.type) {
      case 'stdio':
        await this.startStdioTransport();
        break;
      case 'sse':
        await this.startSSETransport();
        break;
      case 'http':
        await this.startHTTPTransport();
        break;
    }
  }
  
  /**
   * Handle incoming request with authentication
   */
  private async handleRequest(request: any, context: RequestContext): Promise<any> {
    // 1. Authenticate request
    const authResult = await this.config.authProvider.authenticate(context);
    
    if (!authResult.authenticated || !authResult.userId) {
      throw new AuthError(authResult.error || 'Authentication failed');
    }
    
    // 2. Resolve resource token
    const accessToken = await this.config.tokenResolver.resolveToken(
      authResult.userId,
      this.config.resourceType
    );
    
    if (!accessToken) {
      throw new TokenError(`No ${this.config.resourceType} token found for user`);
    }
    
    // 3. Get or create server instance for this user
    const server = await this.getServerForUser(authResult.userId, accessToken);
    
    // 4. Forward request to user's server instance
    return server.handleRequest(request);
  }
  
  /**
   * Get or create a server instance for a user
   */
  private async getServerForUser(userId: string, accessToken: string): Promise<Server> {
    // Check if we have a cached server instance
    if (this.serverPool.has(userId)) {
      const instance = this.serverPool.get(userId)!;
      
      // Refresh if token changed
      if (instance.accessToken !== accessToken) {
        await instance.server.close();
        this.serverPool.delete(userId);
      } else {
        instance.lastUsed = Date.now();
        return instance.server;
      }
    }
    
    // Create new server instance
    const server = await this.config.serverFactory(accessToken, userId);
    
    // Cache if pooling enabled
    if (this.config.pooling?.enabled) {
      this.serverPool.set(userId, {
        server,
        accessToken,
        userId,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });
      
      // Start cleanup timer
      this.scheduleCleanup();
    }
    
    return server;
  }
  
  /**
   * Clean up idle server instances
   */
  private scheduleCleanup(): void {
    const timeout = this.config.pooling?.idleTimeoutMs || 5 * 60 * 1000; // 5 min default
    
    setTimeout(() => {
      const now = Date.now();
      
      for (const [userId, instance] of this.serverPool.entries()) {
        if (now - instance.lastUsed > timeout) {
          instance.server.close();
          this.serverPool.delete(userId);
        }
      }
      
      if (this.serverPool.size > 0) {
        this.scheduleCleanup();
      }
    }, timeout);
  }
  
  /**
   * Stop the wrapped server
   */
  async stop(): Promise<void> {
    // Close all pooled servers
    for (const instance of this.serverPool.values()) {
      await instance.server.close();
    }
    this.serverPool.clear();
    
    await this.config.authProvider.cleanup?.();
  }
  
  private async startSSETransport(): Promise<void> {
    const express = await import('express');
    const app = express.default();
    
    app.post('/message', async (req, res) => {
      try {
        const context: RequestContext = {
          headers: req.headers as Record<string, string>,
          transport: 'sse',
          timestamp: new Date()
        };
        
        const result = await this.handleRequest(req.body, context);
        res.json(result);
      } catch (error) {
        res.status(401).json({ error: error.message });
      }
    });
    
    const port = this.config.transport.port || 3000;
    app.listen(port, () => {
      console.log(`MCP server listening on port ${port}`);
    });
  }
  
  private async startStdioTransport(): Promise<void> {
    // For stdio, we use a single-user mode with env var
    const accessToken = process.env[`${this.config.resourceType.toUpperCase()}_ACCESS_TOKEN`];
    if (!accessToken) {
      throw new Error(`${this.config.resourceType.toUpperCase()}_ACCESS_TOKEN required for stdio mode`);
    }
    
    const server = await this.config.serverFactory(accessToken, 'stdio-user');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
  
  private async startHTTPTransport(): Promise<void> {
    // Similar to SSE but with different endpoint structure
    // Implementation details...
  }
}

interface ServerInstance {
  server: Server;
  accessToken: string;
  userId: string;
  createdAt: number;
  lastUsed: number;
}
```

## Usage Examples

### Example 1: Wrap Existing Instagram MCP Server

```typescript
// tenant-manager/server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@prmichaelsen/instagram-mcp';
import { JWTAuthProvider } from './auth/jwt-provider.js';
import { DatabaseTokenResolver } from './auth/token-resolver.js';

const wrappedServer = wrapServer({
  // Factory creates Instagram server with user's token
  serverFactory: (accessToken, userId) => {
    return createServer(accessToken);
  },
  
  // JWT authentication
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.JWT_SECRET!,
    database: { host: 'localhost', database: 'tenants' }
  }),
  
  // Resolve Instagram token from database
  tokenResolver: new DatabaseTokenResolver({
    database: { host: 'localhost', database: 'tenants' }
  }),
  
  resourceType: 'instagram',
  
  // SSE transport for remote access
  transport: {
    type: 'sse',
    port: 3000,
    basePath: '/mcp'
  },
  
  // Enable server pooling for performance
  pooling: {
    enabled: true,
    maxServersPerUser: 1,
    idleTimeoutMs: 5 * 60 * 1000 // 5 minutes
  },
  
  // Middleware
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  }
});

await wrappedServer.start();
console.log('Multi-tenant Instagram MCP server running on http://localhost:3000/mcp');
```

### Example 2: Wrap GitHub MCP Server

```typescript
// tenant-manager/github-server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@prmichaelsen/github-mcp';

const wrappedServer = wrapServer({
  serverFactory: (accessToken, userId) => createServer(accessToken),
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'github',
  transport: { type: 'sse', port: 3001 }
});

await wrappedServer.start();
```

### Example 3: Multiple Wrapped Servers

```typescript
// tenant-manager/multi-service.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer as createInstagramServer } from '@prmichaelsen/instagram-mcp';
import { createServer as createGitHubServer } from '@prmichaelsen/github-mcp';

// Shared auth configuration
const authConfig = {
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... })
};

// Instagram server
const instagramServer = wrapServer({
  ...authConfig,
  serverFactory: (token, userId) => createInstagramServer(token),
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000, basePath: '/instagram' }
});

// GitHub server
const githubServer = wrapServer({
  ...authConfig,
  serverFactory: (token, userId) => createGitHubServer(token),
  resourceType: 'github',
  transport: { type: 'sse', port: 3000, basePath: '/github' }
});

await Promise.all([
  instagramServer.start(),
  githubServer.start()
]);
```

## Server Pooling Strategy

### Why Pooling?

Creating a new MCP server instance for every request is expensive. Pooling allows us to:

1. **Reuse server instances** for the same user
2. **Reduce latency** by avoiding repeated initialization
3. **Manage resources** by cleaning up idle instances

### Pooling Behavior

```typescript
// First request from user A
Request 1 (User A) → Create server instance → Cache → Execute
Request 2 (User A) → Reuse cached instance → Execute
Request 3 (User A) → Reuse cached instance → Execute

// After idle timeout
[5 minutes pass] → Cleanup idle instance

// New request creates fresh instance
Request 4 (User A) → Create new instance → Cache → Execute
```

### Token Refresh Handling

```typescript
// User's token is refreshed
Request 1 (User A, token v1) → Create server → Cache
Request 2 (User A, token v2) → Detect token change → Close old server → Create new server → Cache
```

## Benefits of Server Wrapping Pattern

1. ✅ **Zero modification**: Existing MCP servers work without changes
2. ✅ **Clean separation**: Auth logic completely separate from business logic
3. ✅ **Reusable**: Same wrapper works for any MCP server
4. ✅ **Performance**: Server pooling reduces overhead
5. ✅ **Type-safe**: Full TypeScript support
6. ✅ **Flexible**: Supports multiple auth schemes
7. ✅ **Scalable**: Per-user server instances enable true multi-tenancy

## Comparison: Tool Wrapping vs Server Wrapping

| Aspect | Tool Wrapping | Server Wrapping |
|--------|---------------|-----------------|
| **Modification Required** | Must wrap each tool | No modification needed |
| **Boilerplate** | High (wrap every tool) | Low (wrap once) |
| **Existing Servers** | Requires refactoring | Works immediately |
| **Performance** | Tool-level overhead | Server-level pooling |
| **Complexity** | Simple per-tool logic | More complex pooling |
| **Best For** | New servers, fine-grained control | Existing servers, quick adoption |

## Recommended Approach: Support Both

```typescript
// lib/mcp-auth/src/index.ts

// Server wrapping (recommended for existing servers)
export { wrapServer } from './wrapper/index.js';

// Tool wrapping (for new servers with fine-grained control)
export { withAuth } from './server/decorators.js';
export { AuthenticatedTool } from './server/tool.js';
export { AuthenticatedMCPServer } from './server/mcp-server.js';
```

## Standard Server Export Format

For maximum compatibility, MCP servers should export:

```typescript
// Recommended export format
export interface MCPServerFactory {
  /**
   * Create a configured MCP server instance
   * @param accessToken - Resource-specific access token
   * @param userId - Optional user identifier for logging/tracking
   */
  (accessToken: string, userId?: string): Server | Promise<Server>;
}

// Example
export const createServer: MCPServerFactory = (accessToken, userId) => {
  // Create and configure server
  return server;
};
```

## Migration Path

1. **Phase 1**: Implement server wrapping in mcp-auth
2. **Phase 2**: Update agentbase to export factory function
3. **Phase 3**: Create example tenant manager using wrapServer()
4. **Phase 4**: Document pattern for other MCP server authors
5. **Phase 5**: Deprecate tool-wrapping pattern (or keep as alternative)

## Summary

The **server wrapping pattern** provides:
- ✅ Zero-modification support for existing MCP servers
- ✅ Clean separation of concerns
- ✅ Server pooling for performance
- ✅ True multi-tenancy with per-user instances
- ✅ Flexible authentication schemes
- ✅ Easy adoption for MCP server authors

This approach makes `@prmichaelsen/mcp-auth` a true "drop-in" authentication solution for any MCP server.
