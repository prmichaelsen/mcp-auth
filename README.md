# @prmichaelsen/mcp-auth

Authentication and multi-tenancy framework for MCP (Model Context Protocol) servers.

## Overview

`@prmichaelsen/mcp-auth` provides a pluggable authentication system for MCP servers, enabling:

- **Zero modification**: Wrap existing MCP servers without code changes
- **Multi-tenancy**: Multiple users with separate resource tokens
- **Auth-agnostic**: Support for JWT, environment variables, or custom auth schemes
- **Transport-agnostic**: Works with stdio, HTTP, and SSE transports
- **Type-safe**: Full TypeScript support
- **Composable**: Middleware for rate limiting, logging, timeouts, retries

## Two Patterns

### Pattern 1: Server Wrapping (Recommended for Production)

Wrap existing MCP servers without modification:

```typescript
import { wrapServer, JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';
import { createServer } from '@myorg/my-mcp-server';

const wrapped = wrapServer({
  serverFactory: createServer,
  
  // Validates JWT from tenant manager
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.JWT_SECRET
  }),
  
  // Resolves tokens via tenant manager API (recommended)
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: process.env.TENANT_MANAGER_URL,
    serviceToken: process.env.SERVICE_TOKEN
  }),
  
  resourceType: 'myapi',
  transport: { type: 'sse', port: 3000 }
});

await wrapped.start();
```

### Pattern 2: Tool-Level Auth

Build new servers with integrated authentication:

```typescript
import { AuthenticatedMCPServer, withAuth, EnvAuthProvider, SimpleTokenResolver } from '@prmichaelsen/mcp-auth';

const server = new AuthenticatedMCPServer({
  name: 'my-server',
  authProvider: new EnvAuthProvider(),
  tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' }),
  resourceType: 'myapi',
  transport: { type: 'stdio' }
});

server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
  const client = new MyAPIClient(accessToken);
  return client.getData(args);
}));

await server.start();
```

## Installation

```bash
# Core package
npm install @prmichaelsen/mcp-auth @modelcontextprotocol/sdk

# For JWT support
npm install jsonwebtoken

# For SSE/HTTP transports
npm install express cors
```

## Authentication Providers

### EnvAuthProvider (Single-User)

For local development and single-user scenarios:

```typescript
import { EnvAuthProvider, SimpleTokenResolver } from '@prmichaelsen/mcp-auth';

const authProvider = new EnvAuthProvider({
  userIdEnvVar: 'MCP_USER_ID',
  defaultUserId: 'local-user'
});

const tokenResolver = new SimpleTokenResolver({
  tokenEnvVar: 'API_TOKEN'
});
```

### JWTAuthProvider + APITokenResolver (Multi-Tenant Production) ⭐ RECOMMENDED

For production multi-tenant deployments:

```typescript
import { JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';

// Validates JWT tokens from tenant manager
const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  userIdClaim: 'sub'
});

// Resolves tokens via tenant manager API
const tokenResolver = new APITokenResolver({
  tenantManagerUrl: 'https://tenant-manager.example.com',
  serviceToken: process.env.SERVICE_TOKEN,
  cacheTokens: true, // Cache for performance
  cacheTtl: 300000 // 5 minutes
});
```

**Why API-Based is Better:**
- ✅ Automatic token refresh (no new JWT needed)
- ✅ Immediate token revocation
- ✅ Tokens not exposed in JWT
- ✅ Small JWT size (~200 bytes)
- ✅ Centralized token management

### JWTAuthProvider + JWTTokenResolver (MVP/Prototyping)

For quick setup with JWT-embedded tokens:

```typescript
import { JWTAuthProvider, JWTTokenResolver } from '@prmichaelsen/mcp-auth';

const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  extractTokens: true // Extract tokens from JWT
});

const tokenResolver = new JWTTokenResolver({ authProvider });
```

**Trade-offs:**
- ✅ Zero API calls (faster)
- ✅ Simpler to implement
- ❌ Token rotation requires new JWT
- ❌ Larger JWT size
- ❌ Tokens exposed in JWT payload

### JWTAuthProvider (Static Servers) ⭐ NEW

For servers that manage their own data and only need user identification:

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
  
  // No tokenResolver needed! ✨
  
  resourceType: 'my-service',
  transport: {
    type: 'sse',
    port: 3000,
    cors: true,
    corsOrigin: process.env.CORS_ORIGIN
  }
});
```

**Perfect for:**
- ✅ Multi-tenant SaaS with own database
- ✅ User-scoped services
- ✅ Internal tools without external APIs
- ✅ Static data management servers

**Benefits:**
- ✅ Simplest configuration
- ✅ No external credential management
- ✅ JWT validation only (userId extraction)
- ✅ Complete user isolation via ephemeral instances

### APITokenResolver (API-Based)

For resolving tokens via tenant manager API:

```typescript
import { JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';

const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET
});

const tokenResolver = new APITokenResolver({
  tenantManagerUrl: 'https://tenant-manager.example.com',
  serviceToken: process.env.SERVICE_TOKEN,
  endpointPath: '/api/credentials/:userId/:resourceType'
});
```

### Custom Provider

Implement your own authentication logic:

```typescript
import { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';

class CustomAuthProvider implements AuthProvider {
  async authenticate(context: RequestContext): Promise<AuthResult> {
    const apiKey = context.headers?.['x-api-key'];
    
    if (!apiKey) {
      return { authenticated: false, error: 'No API key' };
    }
    
    // Your validation logic
    return {
      authenticated: true,
      userId: 'user-123'
    };
  }
}
```

## Middleware Composition

```typescript
import { compose, withAuth, withRateLimit, withLogging, withTimeout } from '@prmichaelsen/mcp-auth';

const getTool = compose(
  withLogging({ logArgs: true }),
  withRateLimit({ maxRequests: 100, windowMs: 60000 }),
  withTimeout(5000),
  withAuth(),
  async (args, accessToken, userId) => {
    // Your tool logic
  }
);

server.registerTool('get_data', getTool);
```

## Transports

### Stdio (Local)

```typescript
transport: { type: 'stdio' }
```

### SSE (Remote Multi-Tenant)

```typescript
transport: {
  type: 'sse',
  port: 3000,
  host: '0.0.0.0',
  basePath: '/mcp',
  cors: true,
  corsOrigin: 'https://your-app.example.com'  // REQUIRED when cors: true
}
```

**Endpoints created:**
- `GET /mcp` - Server info and available endpoints
- `POST /mcp/message` - MCP protocol messages (requires JWT)
- `GET /mcp/health` - Health check endpoint

#### ⚠️ CORS Security

When enabling CORS, you **MUST** specify `corsOrigin` with explicit origins:

```typescript
// ✅ SECURE - Single origin
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: 'https://app.example.com'
}

// ✅ SECURE - Multiple origins
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: ['https://app1.example.com', 'https://app2.example.com']
}

// ❌ INSECURE - Wildcard blocked in production
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: '*'  // ConfigurationError in production!
}

// ❌ INSECURE - Missing corsOrigin
transport: {
  type: 'sse',
  cors: true  // ConfigurationError: corsOrigin required!
}
```

**Security Requirements:**
- `corsOrigin` is **REQUIRED** when `cors: true`
- Wildcard (`*`) is **ONLY** allowed in development (`NODE_ENV !== 'production'`)
- In production, wildcard throws `ConfigurationError` to prevent CSRF attacks
- Use specific origins to ensure only your applications can access the MCP server

### HTTP (Remote)

```typescript
transport: {
  type: 'http',
  port: 3000,
  host: '0.0.0.0'
}
```

## MCP Server Contract

To make your MCP server compatible with `wrapServer()`, export a factory function:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({ name: 'my-server', version: '1.0.0' });
  const client = new MyAPIClient(accessToken);
  
  // Register your tool handlers...
  
  return server;
}
```

That's it! No mcp-auth imports needed in your server.

## Architecture

### Three-Tier Deployment

1. **Chat Platform** - Sends MCP requests with JWT
2. **Tenant Manager** - Issues JWTs, manages user credentials
3. **MCP Server Instance** - Uses mcp-auth to wrap MCP servers

### Token Resolution Approaches

**Approach 1: JWT with Embedded Tokens** (Recommended)
- Tenant manager includes resource tokens in JWT
- Zero external calls
- Fastest performance

**Approach 2: API-Based Resolution**
- Tenant manager provides API for token lookup
- Better separation of concerns
- Easier token rotation

See [`agent/token-resolution-approaches.md`](./agent/token-resolution-approaches.md) for details.

## Documentation

Comprehensive architecture documentation in [`agent/`](./agent/):

- [`server-wrapping-pattern.md`](./agent/server-wrapping-pattern.md) - Server wrapping architecture
- [`server-contract.md`](./agent/server-contract.md) - MCP server compatibility guide
- [`dual-pattern-architecture.md`](./agent/dual-pattern-architecture.md) - Both patterns explained
- [`token-resolution-approaches.md`](./agent/token-resolution-approaches.md) - Token resolution strategies
- [`why-two-steps.md`](./agent/why-two-steps.md) - AuthProvider vs TokenResolver
- [`INTEGRATION.md`](./INTEGRATION.md) - Integration guide for MCP server authors

## Examples

Working examples coming soon in [`examples/`](./examples/):

- `simple-stdio/` - Single-user stdio server
- `wrapped-server/` - Server wrapping with JWT
- `tool-level-auth/` - Tool-level authentication
- `jwt-multi-tenant/` - Multi-tenant JWT deployment

## API Reference

### Core Functions

- `wrapServer(config)` - Wrap MCP server with authentication
- `withAuth(handler)` - Add auth to function-based tools
- `compose(...middlewares)` - Compose middleware functions

### Classes

- `AuthenticatedMCPServer` - MCP server with integrated auth
- `AuthenticatedTool` - Wrapper for class-based tools
- `BaseAuthProvider` - Base class for auth providers

### Providers

- `EnvAuthProvider` - Environment variable authentication
- `SimpleTokenResolver` - Environment variable token resolution
- `JWTAuthProvider` - JWT validation with token extraction
- `JWTTokenResolver` - JWT-embedded token resolution
- `APITokenResolver` - API-based token resolution

### Middleware

- `withAuth()` - Authentication
- `withLogging()` - Request/response logging
- `withRateLimit()` - Rate limiting per user
- `withTimeout()` - Request timeout
- `withRetry()` - Automatic retry on failure

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/prmichaelsen/mcp-auth).
