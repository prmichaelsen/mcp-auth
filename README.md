# @prmichaelsen/mcp-auth

Authentication and multi-tenancy framework for MCP (Model Context Protocol) servers.

## Overview

`@prmichaelsen/mcp-auth` provides a pluggable authentication system for MCP servers, enabling:

- **Multi-tenancy**: Multiple users with separate resource tokens
- **Auth-agnostic**: Support for JWT, OAuth, API Keys, or custom auth schemes
- **Transport-agnostic**: Works with stdio, HTTP, and SSE transports
- **Type-safe**: Full TypeScript support
- **Composable**: Middleware for rate limiting, logging, etc.

## Installation

```bash
npm install @prmichaelsen/mcp-auth @modelcontextprotocol/sdk
```

## Quick Start

### Simple Function-Based Tool

```typescript
import { withAuth, AuthenticatedMCPServer } from '@prmichaelsen/mcp-auth';
import { EnvAuthProvider, SimpleTokenResolver } from '@prmichaelsen/mcp-auth/providers/env';

// Setup auth provider
const authProvider = new EnvAuthProvider();
const tokenResolver = new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' });

// Create server
const server = new AuthenticatedMCPServer({
  name: 'my-mcp-server',
  authProvider,
  tokenResolver,
  resourceType: 'myapi',
  transport: { type: 'stdio' }
});

// Register tool with automatic auth
server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
  // accessToken and userId are automatically injected
  const client = new MyAPIClient(accessToken);
  return client.getData(args);
}));

await server.start();
```

### Class-Based Tool

```typescript
import { Tool, AuthenticatedTool } from '@prmichaelsen/mcp-auth';

class GetDataTool implements Tool {
  name = 'get_data';
  description = 'Fetch data from API';
  
  async execute(args, accessToken, userId) {
    const client = new MyAPIClient(accessToken);
    return client.getData(args);
  }
}

server.registerTool(new AuthenticatedTool(new GetDataTool()));
```

## Authentication Providers

### Environment Variable (Simple)

```typescript
import { EnvAuthProvider, SimpleTokenResolver } from '@prmichaelsen/mcp-auth/providers/env';

const authProvider = new EnvAuthProvider();
const tokenResolver = new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' });
```

### JWT (Multi-tenant)

```typescript
import { JWTAuthProvider } from '@prmichaelsen/mcp-auth/providers/jwt';

const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  database: {
    host: 'localhost',
    database: 'users'
  }
});
```

### OAuth 2.0

```typescript
import { OAuthProvider } from '@prmichaelsen/mcp-auth/providers/oauth';

const authProvider = new OAuthProvider({
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  clientId: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET
});
```

### Custom Provider

```typescript
import { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';

class CustomAuthProvider implements AuthProvider {
  async authenticate(context: RequestContext): Promise<AuthResult> {
    // Your custom auth logic
    const apiKey = context.headers?.['x-api-key'];
    
    if (!apiKey) {
      return { authenticated: false, error: 'No API key' };
    }
    
    // Validate and return user ID
    return {
      authenticated: true,
      userId: 'user-123'
    };
  }
}
```

## Middleware Composition

```typescript
import { compose, withAuth, withRateLimit, withLogging } from '@prmichaelsen/mcp-auth';

const getTool = compose(
  withLogging(),
  withRateLimit({ maxRequests: 100, windowMs: 60000 }),
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
const server = new AuthenticatedMCPServer({
  // ...
  transport: { type: 'stdio' }
});
```

### HTTP/SSE (Remote)

```typescript
const server = new AuthenticatedMCPServer({
  // ...
  transport: {
    type: 'sse',
    port: 3000,
    host: '0.0.0.0',
    basePath: '/mcp'
  }
});
```

## Documentation

See the [`agent/`](./agent/) directory for detailed architecture documentation:

- [`multi-tenant-architecture.md`](./agent/multi-tenant-architecture.md) - Overall architecture and auth schemes
- [`lib-structure.md`](./agent/lib-structure.md) - Package structure and design
- [`tool-patterns.md`](./agent/tool-patterns.md) - Tool registration patterns

## Examples

See the [`examples/`](./examples/) directory for complete examples:

- `simple-stdio/` - Single-user stdio server
- `jwt-multi-tenant/` - Multi-tenant JWT server
- `oauth-server/` - OAuth authentication flow

## License

MIT

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.
