# MCP Server Contract for mcp-auth Compatibility

## Overview

For an MCP server to be compatible with `@prmichaelsen/mcp-auth` server wrapping, it simply needs to **export a factory function** that creates a configured server instance.

## Minimal Contract

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Factory function that creates a configured MCP server
 * @param accessToken - Resource-specific access token (e.g., Instagram, GitHub)
 * @param userId - Optional user identifier for logging/tracking
 * @returns Configured MCP server instance
 */
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'my-mcp-server',
    version: '1.0.0'
  }, {
    capabilities: { tools: {} }
  });
  
  // Register your tool handlers here
  // Use accessToken to authenticate with your API
  
  return server;
}
```

That's it! No special interfaces, no base classes, no mcp-auth imports required.

## Complete Example: Instagram MCP Server

```typescript
// @prmichaelsen/instagram-mcp/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { InstagramClient } from './client.js';

/**
 * Create an Instagram MCP server instance
 * @param accessToken - Instagram Graph API access token
 * @param userId - Optional user ID for logging
 */
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'instagram-mcp',
    version: '1.0.0'
  }, {
    capabilities: { tools: {} }
  });
  
  // Create Instagram API client with the provided token
  const client = new InstagramClient(accessToken);
  
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'instagram_get_profile',
        description: 'Get Instagram profile information',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { 
              type: 'string', 
              description: 'Instagram user ID or username' 
            }
          },
          required: ['userId']
        }
      },
      {
        name: 'instagram_get_media',
        description: 'Get user media posts',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            limit: { type: 'number', default: 10 }
          },
          required: ['userId']
        }
      }
    ]
  }));
  
  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case 'instagram_get_profile': {
          const profile = await client.getProfile(args.userId);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(profile, null, 2)
            }]
          };
        }
        
        case 'instagram_get_media': {
          const media = await client.getMedia(args.userId, args.limit);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(media, null, 2)
            }]
          };
        }
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });
  
  return server;
}

// Optional: Convenience function for single-user stdio mode
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

## Package.json Exports

```json
{
  "name": "@prmichaelsen/instagram-mcp",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  }
}
```

## Using with mcp-auth

Once your server exports `createServer`, it can be wrapped with authentication:

```typescript
// tenant-manager/server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@prmichaelsen/instagram-mcp';
import { JWTAuthProvider, DatabaseTokenResolver } from './auth/index.js';

const wrappedServer = wrapServer({
  // Your server factory - mcp-auth will call this with each user's token
  serverFactory: (accessToken, userId) => createServer(accessToken, userId),
  
  // Authentication configuration
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'instagram',
  
  // Transport configuration
  transport: {
    type: 'sse',
    port: 3000,
    basePath: '/mcp'
  }
});

await wrappedServer.start();
```

## Key Points

### ✅ What You NEED to Do

1. **Export a `createServer` function** that accepts `(accessToken: string, userId?: string)`
2. **Return a configured `Server` instance** from `@modelcontextprotocol/sdk`
3. **Use the `accessToken` parameter** to authenticate with your API

### ❌ What You DON'T Need to Do

1. ❌ Import anything from `@prmichaelsen/mcp-auth`
2. ❌ Implement any special interfaces
3. ❌ Extend any base classes
4. ❌ Handle authentication logic yourself
5. ❌ Manage multiple users
6. ❌ Implement token refresh
7. ❌ Set up HTTP/SSE transports

All of that is handled by `mcp-auth` when your server is wrapped!

## Alternative Patterns

### Pattern 1: Class-Based Factory

```typescript
export class InstagramMCPServer {
  private client: InstagramClient;
  
  constructor(accessToken: string, userId?: string) {
    this.client = new InstagramClient(accessToken);
  }
  
  createServer(): Server {
    const server = new Server({ name: 'instagram-mcp', version: '1.0.0' });
    this.registerHandlers(server);
    return server;
  }
  
  private registerHandlers(server: Server) {
    // Register handlers...
  }
}

// Export factory function
export function createServer(accessToken: string, userId?: string): Server {
  const instance = new InstagramMCPServer(accessToken, userId);
  return instance.createServer();
}
```

### Pattern 2: Async Factory

```typescript
export async function createServer(accessToken: string, userId?: string): Promise<Server> {
  // Validate token before creating server
  await validateToken(accessToken);
  
  const server = new Server({ name: 'my-server', version: '1.0.0' });
  
  // Async setup
  await setupHandlers(server, accessToken);
  
  return server;
}
```

Both patterns work with `mcp-auth`!

## TypeScript Type Definition

For maximum compatibility, you can export this type:

```typescript
/**
 * Standard MCP server factory function
 */
export type MCPServerFactory = (
  accessToken: string,
  userId?: string
) => Server | Promise<Server>;

export const createServer: MCPServerFactory = (accessToken, userId) => {
  // Implementation
};
```

## Testing Your Server

### Test 1: Single-User Mode (No mcp-auth)

```typescript
// test-single-user.ts
import { createServer } from './index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer('test-token-123');
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Test 2: Multi-Tenant Mode (With mcp-auth)

```typescript
// test-multi-tenant.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from './index.js';

const wrapped = wrapServer({
  serverFactory: createServer,
  authProvider: new TestAuthProvider(),
  tokenResolver: new TestTokenResolver(),
  resourceType: 'test',
  transport: { type: 'sse', port: 3000 }
});

await wrapped.start();
```

## Migration Guide

### Existing Server Without Factory

If your server looks like this:

```typescript
// OLD: Direct server creation
const server = new Server({ name: 'my-server', version: '1.0.0' });
const accessToken = process.env.ACCESS_TOKEN;
const client = new MyAPIClient(accessToken);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Uses client from closure
});
```

**Refactor to:**

```typescript
// NEW: Factory function
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({ name: 'my-server', version: '1.0.0' });
  const client = new MyAPIClient(accessToken);
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Uses client from closure (same as before!)
  });
  
  return server;
}

// For backward compatibility
export async function startStdioServer() {
  const accessToken = process.env.ACCESS_TOKEN;
  if (!accessToken) throw new Error('ACCESS_TOKEN required');
  
  const server = createServer(accessToken);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

The refactor is minimal - just wrap your existing code in a function!

## Summary

**To make your MCP server compatible with `@prmichaelsen/mcp-auth`:**

1. Export a `createServer(accessToken, userId?)` function
2. Return a configured `Server` instance
3. Use the `accessToken` parameter for API calls

That's all! No dependencies on mcp-auth, no special interfaces, no complex setup.

Your server remains **fully functional as a standalone package** while being **automatically compatible** with mcp-auth's multi-tenant wrapping.
