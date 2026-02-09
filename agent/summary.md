# @prmichaelsen/mcp-auth - Project Summary

## Vision

Create a **reusable, auth-agnostic authentication and multi-tenancy framework** for MCP (Model Context Protocol) servers that **wraps existing servers without requiring any modifications**.

## Problem Statement

The original `@prmichaelsen/agentbase` (Instagram MCP server) was designed as a single-user, stdio-based MCP server. To make it production-ready and multi-tenant, we needed:

1. **Authentication**: Support multiple auth schemes (JWT, OAuth, API Keys, etc.)
2. **Multi-tenancy**: Multiple users with separate Instagram access tokens
3. **Remote access**: HTTP/SSE transport for remote clients
4. **Reusability**: Extract auth logic into a separate package for use in other MCP servers
5. **Zero modification**: Work with existing MCP servers without code changes

## Solution Architecture

### Core Design Principles

1. **Zero Modification**: Existing MCP servers work without any code changes
2. **Server Wrapping**: Wrap entire server instances, not individual tools
3. **Separation of Concerns**: MCP servers focus on business logic; auth is handled by this framework
4. **Pluggable Authentication**: Inject any auth provider via interface
5. **Provider Pattern**: `AuthProvider` validates requests, `ResourceTokenResolver` maps users to resource tokens
6. **Transport Agnostic**: Works with stdio (local), HTTP, or SSE (remote)
7. **Server Pooling**: Reuse server instances per user for performance

### Key Abstractions

```typescript
// Validates requests and returns user ID
interface AuthProvider {
  authenticate(context: RequestContext): Promise<AuthResult>;
}

// Maps user ID to resource-specific access token
interface ResourceTokenResolver {
  resolveToken(userId: string, resourceType: string): Promise<string | null>;
}

// Wraps entire MCP server with authentication
function wrapServer(config: {
  serverFactory: (accessToken: string, userId: string) => Server;
  authProvider: AuthProvider;
  tokenResolver: ResourceTokenResolver;
  resourceType: string;
  transport: TransportConfig;
}): AuthenticatedServerWrapper;
```

### Server Contract

MCP servers only need to export a factory function:

```typescript
// That's it! No mcp-auth imports needed
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({ name: 'my-server', version: '1.0.0' });
  // Register handlers using accessToken
  return server;
}
```

### Primary Pattern: Server Wrapping

```typescript
// Existing MCP server (no modifications needed)
import { createServer } from '@prmichaelsen/instagram-mcp';

// Wrap with authentication
import { wrapServer } from '@prmichaelsen/mcp-auth';

const wrappedServer = wrapServer({
  serverFactory: (accessToken, userId) => createServer(accessToken, userId),
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});

await wrappedServer.start();
```

### Alternative Pattern: Tool-Level Wrapping (Optional)

For new servers that need fine-grained control:

```typescript
const getTool = withAuth(async (args, accessToken, userId) => {
  // Auth automatically injected
});
server.registerTool('get_data', getTool);
```

## Project Structure

```
/home/prmichaelsen/mcp-auth/
├── agent/                          # Architecture documentation
│   ├── multi-tenant-architecture.md  # Overall architecture, auth schemes
│   ├── lib-structure.md              # Package structure design
│   ├── tool-patterns.md              # Tool registration patterns (optional)
│   ├── server-wrapping-pattern.md    # Server wrapping architecture (PRIMARY)
│   └── server-contract.md            # Contract for compatible servers
├── src/                            # Source code (TO BE IMPLEMENTED)
│   ├── index.ts                    # Main exports
│   ├── types.ts                    # Core types
│   ├── auth/                       # Authentication
│   │   ├── index.ts
│   │   ├── types.ts                # AuthProvider interface
│   │   └── providers/              # Provider implementations
│   │       ├── env-provider.ts     # Simple env var (default)
│   │       ├── jwt-provider.ts     # JWT authentication
│   │       ├── oauth-provider.ts   # OAuth 2.0
│   │       └── apikey-provider.ts  # API key
│   ├── wrapper/                    # Server wrapping (PRIMARY)
│   │   ├── index.ts                # wrapServer() export
│   │   ├── config.ts               # ServerWrapperConfig
│   │   ├── server-wrapper.ts       # AuthenticatedServerWrapper
│   │   └── pool.ts                 # Server pooling logic
│   ├── server/                     # Tool-level wrapping (OPTIONAL)
│   │   ├── index.ts
│   │   ├── mcp-server.ts           # AuthenticatedMCPServer class
│   │   ├── config.ts               # Configuration types
│   │   ├── decorators.ts           # withAuth(), compose()
│   │   └── tool.ts                 # Tool interface, AuthenticatedTool
│   ├── transports/                 # Transport implementations
│   │   ├── index.ts
│   │   ├── stdio-transport.ts
│   │   ├── http-transport.ts
│   │   └── sse-transport.ts
│   └── utils/                      # Utilities
│       ├── errors.ts
│       ├── logger.ts
│       └── validation.ts
├── examples/                       # Example implementations (TO BE CREATED)
│   ├── simple-stdio/               # Single-user stdio
│   ├── wrapped-server/             # Server wrapping example (PRIMARY)
│   ├── jwt-multi-tenant/           # Multi-tenant JWT
│   └── oauth-server/               # OAuth flow
├── package.json                    # ✅ DONE
├── tsconfig.json                   # ✅ DONE
├── esbuild.build.js                # ✅ DONE
├── esbuild.watch.js                # ✅ DONE
├── .gitignore                      # ✅ DONE
├── README.md                       # ✅ DONE
└── LICENSE                         # ✅ DONE
```

## Current Status

### ✅ Completed

1. **Architecture Design** - Comprehensive documentation in `agent/`
2. **Project Bootstrap** - Package setup, build process, TypeScript config
3. **Documentation** - README with usage examples

### 🚧 Next Steps (In Order)

1. **Implement Core Types** (`src/types.ts`, `src/auth/types.ts`)
   - `RequestContext`, `AuthResult`, `AuthProvider`, `ResourceTokenResolver`

2. **Implement Base Provider** (`src/auth/base-provider.ts`)
   - Abstract base class for common provider logic

3. **Implement Simple Provider** (`src/auth/providers/env-provider.ts`)
   - Environment variable-based auth (backward compatible)
   - Simple token resolver (single token for all users)

4. **Implement Server Wrapper (PRIMARY)** (`src/wrapper/`)
   - `ServerWrapperConfig` types
   - `AuthenticatedServerWrapper` class
   - Server pooling logic
   - Per-user server instance management

5. **Implement Transports** (`src/transports/`)
   - Stdio transport wrapper
   - HTTP/SSE transport wrappers

6. **Implement JWT Provider** (`src/auth/providers/jwt-provider.ts`)
   - JWT validation
   - Database token resolver

7. **Create Examples** (`examples/`)
   - Server wrapping example (PRIMARY)
   - Simple stdio example
   - JWT multi-tenant example
   - OAuth example

8. **Optional: Tool-Level Wrapping** (`src/server/`)
   - `withAuth()` decorator
   - `AuthenticatedTool` class
   - Middleware composition

9. **Testing & Documentation**
   - Unit tests
   - Integration tests
   - API documentation

## Usage Examples

### Example 1: Wrap Existing Server (Recommended)

```typescript
// tenant-manager/server.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from '@prmichaelsen/instagram-mcp'; // No modifications needed!
import { JWTAuthProvider, DatabaseTokenResolver } from './auth/index.js';

const wrappedServer = wrapServer({
  // Factory creates Instagram server with user's token
  serverFactory: (accessToken, userId) => createServer(accessToken, userId),
  
  // Authentication
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new DatabaseTokenResolver({ ... }),
  resourceType: 'instagram',
  
  // Transport
  transport: { type: 'sse', port: 3000 },
  
  // Server pooling for performance
  pooling: { enabled: true, idleTimeoutMs: 300000 }
});

await wrappedServer.start();
```

### Example 2: Single-User Stdio (Backward Compatible)

```typescript
// agentbase/src/index.ts
import { createServer } from './server.js';

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const server = createServer(accessToken);
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Authentication Schemes Comparison

| Scheme | Best For | Pros | Cons |
|--------|----------|------|------|
| **JWT** | Stateless APIs, microservices | Standard, scalable, stateless | Token revocation complexity |
| **OAuth 2.0** | Third-party integrations, SSO | Industry standard, delegated access | More complex, requires OAuth server |
| **API Keys** | Service-to-service | Simple, easy to implement | Less secure, no expiration |
| **Firebase** | Rapid prototyping, mobile apps | Managed service, multiple providers | Vendor lock-in, costs |

**Recommended**: OAuth 2.0 for initial auth + JWT for session management

## Key Files to Reference

- **Server Wrapping (PRIMARY)**: [`agent/server-wrapping-pattern.md`](agent/server-wrapping-pattern.md)
- **Server Contract**: [`agent/server-contract.md`](agent/server-contract.md)
- **Architecture**: [`agent/multi-tenant-architecture.md`](agent/multi-tenant-architecture.md)
- **Structure**: [`agent/lib-structure.md`](agent/lib-structure.md)
- **Tool Patterns (Optional)**: [`agent/tool-patterns.md`](agent/tool-patterns.md)
- **Package**: [`package.json`](package.json)
- **Build**: [`esbuild.build.js`](esbuild.build.js)

## Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Clean
npm run clean

# Publish (after implementation)
npm publish
```

## Related Projects

- **agentbase**: `/home/prmichaelsen/agentbase` - Instagram MCP server (will use this package)
- **Future MCP servers**: GitHub, Slack, etc. can all use this framework

## Notes

- Package is scoped: `@prmichaelsen/mcp-auth`
- Public access configured in `package.json`
- MIT licensed
- Peer dependency on `@modelcontextprotocol/sdk ^1.0.4`
- Optional dependencies for JWT support
- **PRIMARY PATTERN**: Server wrapping (zero modification)
- **ALTERNATIVE PATTERN**: Tool-level wrapping (fine-grained control)
- Server pooling for performance optimization
- Compatible with any MCP server that exports `createServer(accessToken, userId?)`
