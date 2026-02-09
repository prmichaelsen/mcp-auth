# Integration Guide for MCP Server Authors

This guide explains how to make your MCP server compatible with `@prmichaelsen/mcp-auth` for authentication and multi-tenancy support.

## Table of Contents

1. [Server Wrapping Pattern (Recommended)](#server-wrapping-pattern-recommended)
2. [Tool-Level Auth Pattern (Alternative)](#tool-level-auth-pattern-alternative)
3. [Hybrid Approach](#hybrid-approach)
4. [Testing Your Integration](#testing-your-integration)

---

## Server Wrapping Pattern (Recommended)

This pattern requires **zero modifications** to your existing MCP server. You only need to export a factory function.

### Step 1: Export a `createServer` Function

Your MCP server should export a function that creates a configured server instance:

```typescript
// my-mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { MyAPIClient } from './client.js';

/**
 * Create an MCP server instance
 * 
 * @param accessToken - API access token for your service
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
  
  // Create API client with the provided token
  const client = new MyAPIClient(accessToken);
  
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'my_tool',
        description: 'My tool description',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' }
          },
          required: ['param']
        }
      }
    ]
  }));
  
  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'my_tool': {
        const result = await client.callAPI(args.param);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
  
  return server;
}
```

### Step 2: Export for Single-User Mode (Optional but Recommended)

For backward compatibility and single-user scenarios:

```typescript
// my-mcp-server/src/index.ts (continued)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Start server in stdio mode (single-user)
 * Reads access token from environment variable
 */
export async function startStdioServer() {
  const accessToken = process.env.MY_API_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MY_API_ACCESS_TOKEN environment variable required');
  }
  
  const server = createServer(accessToken);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// If this is your main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  startStdioServer().catch(console.error);
}
```

### Step 3: Update package.json

```json
{
  "name": "@myorg/my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "bin": {
    "my-mcp-server": "./dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  }
}
```

### That's It!

Your server is now compatible with `@prmichaelsen/mcp-auth`. Users can wrap it for multi-tenancy:

```typescript
// tenant-manager/server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@myorg/my-mcp-server';

const wrapped = wrapServer({
  serverFactory: (accessToken, userId) => createServer(accessToken, userId),
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'myapi',
  transport: { type: 'sse', port: 3000 }
});

await wrapped.start();
```

---

## Tool-Level Auth Pattern (Alternative)

This pattern is for building **new** MCP servers with embedded authentication.

### Step 1: Install mcp-auth

```bash
npm install @prmichaelsen/mcp-auth
```

### Step 2: Use AuthenticatedMCPServer

```typescript
// my-mcp-server/src/index.ts
import { 
  AuthenticatedMCPServer, 
  withAuth,
  EnvAuthProvider,
  SimpleTokenResolver
} from '@prmichaelsen/mcp-auth';
import { MyAPIClient } from './client.js';

/**
 * Create authenticated MCP server
 */
export function createAuthenticatedServer(config?: {
  authProvider?: AuthProvider;
  tokenResolver?: ResourceTokenResolver;
  transport?: TransportConfig;
}) {
  const server = new AuthenticatedMCPServer({
    name: 'my-mcp-server',
    version: '1.0.0',
    authProvider: config?.authProvider || new EnvAuthProvider(),
    tokenResolver: config?.tokenResolver || new SimpleTokenResolver({ 
      tokenEnvVar: 'MY_API_ACCESS_TOKEN' 
    }),
    resourceType: 'myapi',
    transport: config?.transport || { type: 'stdio' }
  });
  
  // Register tools with automatic auth injection
  server.registerTool('my_tool', withAuth(async (args, accessToken, userId) => {
    const client = new MyAPIClient(accessToken);
    return client.callAPI(args.param);
  }));
  
  return server;
}

/**
 * Start server in stdio mode
 */
export async function startStdioServer() {
  const server = createAuthenticatedServer();
  await server.start();
}
```

### Step 3: Class-Based Tools (Optional)

For more structured code:

```typescript
import { Tool, AuthenticatedTool } from '@prmichaelsen/mcp-auth';

class MyTool implements Tool {
  name = 'my_tool';
  description = 'My tool description';
  
  inputSchema = {
    type: 'object',
    properties: {
      param: { type: 'string' }
    },
    required: ['param']
  };
  
  async execute(args: { param: string }, accessToken: string, userId: string) {
    const client = new MyAPIClient(accessToken);
    return client.callAPI(args.param);
  }
}

// Register
server.registerTool(new AuthenticatedTool(new MyTool()));
```

### Step 4: Middleware Composition (Advanced)

```typescript
import { withAuth, withRateLimit, withLogging, compose } from '@prmichaelsen/mcp-auth';

const myTool = compose(
  withLogging({ level: 'info' }),
  withRateLimit({ maxRequests: 10, windowMs: 60000 }),
  withAuth(),
  async (args, accessToken, userId) => {
    const client = new MyAPIClient(accessToken);
    return client.callAPI(args.param);
  }
);

server.registerTool('my_tool', myTool);
```

---

## Hybrid Approach

Support **both patterns** in your server for maximum flexibility:

```typescript
// my-mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { AuthenticatedMCPServer, withAuth } from '@prmichaelsen/mcp-auth';

/**
 * Factory function for server wrapping (no mcp-auth dependency)
 */
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({ name: 'my-mcp-server', version: '1.0.0' });
  const client = new MyAPIClient(accessToken);
  
  // Register handlers...
  
  return server;
}

/**
 * Authenticated server with embedded auth (requires mcp-auth)
 */
export function createAuthenticatedServer(config?: AuthConfig): AuthenticatedMCPServer {
  const server = new AuthenticatedMCPServer({
    name: 'my-mcp-server',
    version: '1.0.0',
    authProvider: config?.authProvider || new EnvAuthProvider(),
    tokenResolver: config?.tokenResolver || new SimpleTokenResolver({ ... }),
    resourceType: 'myapi',
    transport: config?.transport || { type: 'stdio' }
  });
  
  // Register tools with auth
  server.registerTool('my_tool', withAuth(async (args, accessToken, userId) => {
    const client = new MyAPIClient(accessToken);
    return client.callAPI(args.param);
  }));
  
  return server;
}

/**
 * Stdio mode (single-user, no auth)
 */
export async function startStdioServer() {
  const accessToken = process.env.MY_API_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MY_API_ACCESS_TOKEN required');
  
  const server = createServer(accessToken);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### Package.json for Hybrid Approach

```json
{
  "name": "@myorg/my-mcp-server",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "peerDependencies": {
    "@prmichaelsen/mcp-auth": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@prmichaelsen/mcp-auth": {
      "optional": true
    }
  }
}
```

This allows users to:
- Use `createServer()` without installing mcp-auth (server wrapping)
- Use `createAuthenticatedServer()` if they install mcp-auth (embedded auth)

---

## Testing Your Integration

### Test 1: Single-User Mode (No Auth)

```typescript
// test/single-user.test.ts
import { createServer } from '../src/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer('test-token-123');
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Test 2: Server Wrapping (Multi-Tenant)

```typescript
// test/multi-tenant.test.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '../src/index.js';

class TestAuthProvider {
  async authenticate(context) {
    return { authenticated: true, userId: 'test-user' };
  }
}

class TestTokenResolver {
  async resolveToken(userId, resourceType) {
    return 'test-token-123';
  }
}

const wrapped = wrapServer({
  serverFactory: createServer,
  authProvider: new TestAuthProvider(),
  tokenResolver: new TestTokenResolver(),
  resourceType: 'test',
  transport: { type: 'sse', port: 3000 }
});

await wrapped.start();
```

### Test 3: Tool-Level Auth

```typescript
// test/tool-auth.test.ts
import { createAuthenticatedServer } from '../src/index.js';

const server = createAuthenticatedServer({
  authProvider: new TestAuthProvider(),
  tokenResolver: new TestTokenResolver(),
  transport: { type: 'stdio' }
});

await server.start();
```

---

## Summary

### ✅ Server Wrapping Pattern (Recommended)
- **Export**: `createServer(accessToken, userId?): Server`
- **Dependencies**: None (just @modelcontextprotocol/sdk)
- **Best for**: Existing servers, zero modification

### ✅ Tool-Level Auth Pattern
- **Export**: `createAuthenticatedServer(config): AuthenticatedMCPServer`
- **Dependencies**: @prmichaelsen/mcp-auth
- **Best for**: New servers, fine-grained control

### ✅ Hybrid Approach
- **Export**: Both `createServer()` and `createAuthenticatedServer()`
- **Dependencies**: @prmichaelsen/mcp-auth as optional peer dependency
- **Best for**: Maximum flexibility

Choose the pattern that best fits your use case!
