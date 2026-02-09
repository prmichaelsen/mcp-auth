# Reusable MCP Auth Framework - lib/mcp-auth/ Structure

## Overview

This document outlines the structure for `lib/mcp-auth/` - a reusable authentication and multi-tenancy framework for MCP servers that can be extracted into a standalone package (`@prmichaelsen/mcp-auth`).

## Goals

1. **Reusability**: Any MCP server can use this framework
2. **Auth-agnostic**: Support any authentication scheme via providers
3. **Transport-agnostic**: Support stdio, HTTP, SSE
4. **Easy extraction**: Clean separation for future npm package
5. **Type-safe**: Full TypeScript support
6. **Zero config**: Sensible defaults, optional configuration

## Directory Structure

```
lib/
├── mcp-auth/                     # MCP authentication framework
│   ├── index.ts                  # Main exports
│   ├── types.ts                  # Core type definitions
│   ├── auth/
│   │   ├── index.ts              # Auth exports
│   │   ├── types.ts              # AuthProvider interface
│   │   ├── base-provider.ts      # Abstract base class
│   │   └── providers/
│   │       ├── index.ts          # Provider exports
│   │       ├── env-provider.ts   # Simple env var provider (default)
│   │       ├── jwt-provider.ts   # JWT implementation
│   │       ├── oauth-provider.ts # OAuth 2.0 implementation
│   │       └── apikey-provider.ts # API key implementation
│   ├── wrapper/                  # Server wrapping (PRIMARY)
│   │   ├── index.ts              # Wrapper exports
│   │   ├── config.ts             # ServerWrapperConfig
│   │   ├── server-wrapper.ts     # AuthenticatedServerWrapper
│   │   └── pool.ts               # Server pooling logic
│   ├── server/                   # Tool-level auth (OPTIONAL)
│   │   ├── index.ts              # Server exports
│   │   ├── mcp-server.ts         # AuthenticatedMCPServer class
│   │   ├── config.ts             # Configuration types
│   │   ├── decorators.ts         # withAuth(), compose()
│   │   ├── tool.ts               # Tool interface, AuthenticatedTool
│   │   └── middleware/
│   │       ├── auth-middleware.ts # Auth injection middleware
│   │       ├── rate-limit.ts     # Rate limiting
│   │       └── logging.ts        # Request logging
│   ├── transports/
│   │   ├── index.ts              # Transport exports
│   │   ├── stdio-transport.ts    # Stdio transport wrapper
│   │   ├── http-transport.ts     # HTTP transport wrapper
│   │   └── sse-transport.ts      # SSE transport wrapper
│   └── utils/
│       ├── errors.ts             # Custom error types
│       ├── logger.ts             # Logging utilities
│       └── validation.ts         # Input validation
└── (future libs can go here)

src/                              # Instagram-specific code
├── index.ts                      # Entry point (uses lib/)
├── instagram-client.ts           # Instagram API client
├── types.ts                      # Instagram types
└── tools/                        # Instagram tools
    ├── get-profile.ts
    ├── get-media.ts
    └── ...

examples/
├── simple-stdio/                 # Single-user example
│   └── index.ts
├── jwt-multi-tenant/             # JWT multi-tenant example
│   ├── server.ts
│   ├── auth-provider.ts
│   └── database.ts
└── oauth-server/                 # OAuth example
    ├── server.ts
    ├── auth-provider.ts
    └── routes.ts
```

## Core Abstractions

### 1. lib/mcp-auth/types.ts - Core Types

```typescript
/**
 * Generic token resolver - returns access token for a resource
 */
export interface TokenResolver<TContext = any> {
  /**
   * Resolve access token from context
   * @param context - Request context (headers, metadata, etc.)
   * @returns Access token or null if not found
   */
  resolve(context: TContext): Promise<string | null>;
}

/**
 * Request context passed to providers
 */
export interface RequestContext {
  /** Request headers (for HTTP/SSE) */
  headers?: Record<string, string | string[] | undefined>;
  
  /** Request metadata */
  metadata?: Record<string, unknown>;
  
  /** Transport type */
  transport: 'stdio' | 'sse' | 'http';
  
  /** Timestamp */
  timestamp: Date;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean;
  
  /** User/tenant identifier */
  userId?: string;
  
  /** Error message if authentication failed */
  error?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
```

### 2. lib/mcp-auth/auth/types.ts - Auth Provider Interface

```typescript
/**
 * Authentication Provider Interface
 * 
 * Implement this to provide custom authentication logic.
 * The provider is responsible for validating requests and
 * identifying users/tenants.
 */
export interface AuthProvider {
  /**
   * Authenticate a request
   * @param context - Request context
   * @returns Authentication result with user ID
   */
  authenticate(context: RequestContext): Promise<AuthResult>;
  
  /**
   * Optional: Initialize provider (e.g., connect to database)
   */
  initialize?(): Promise<void>;
  
  /**
   * Optional: Cleanup resources
   */
  cleanup?(): Promise<void>;
}

/**
 * Token Resolver Interface
 * 
 * Implement this to resolve resource-specific access tokens
 * (e.g., Instagram token, GitHub token, etc.) for authenticated users.
 */
export interface ResourceTokenResolver {
  /**
   * Resolve resource access token for a user
   * @param userId - Authenticated user ID
   * @param resourceType - Type of resource (e.g., 'instagram', 'github')
   * @returns Access token or null if not found
   */
  resolveToken(userId: string, resourceType: string): Promise<string | null>;
  
  /**
   * Optional: Refresh an expired token
   * @param userId - User ID
   * @param resourceType - Resource type
   * @returns New access token or null
   */
  refreshToken?(userId: string, resourceType: string): Promise<string | null>;
}
```

### 3. lib/mcp-auth/server/config.ts - Server Configuration

```typescript
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';

export interface ServerConfig {
  /** Server name */
  name?: string;
  
  /** Server version */
  version?: string;
  
  /** Authentication provider */
  authProvider: AuthProvider;
  
  /** Token resolver for resource-specific tokens */
  tokenResolver: ResourceTokenResolver;
  
  /** Resource type (e.g., 'instagram', 'github') */
  resourceType: string;
  
  /** Transport configuration */
  transport: TransportConfig;
  
  /** Optional middleware */
  middleware?: {
    rateLimit?: RateLimitConfig;
    logging?: LoggingConfig;
  };
}

export interface TransportConfig {
  type: 'stdio' | 'sse' | 'http';
  
  /** Port for HTTP/SSE */
  port?: number;
  
  /** Host for HTTP/SSE */
  host?: string;
  
  /** Base path for SSE endpoint */
  basePath?: string;
}

export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: RequestContext) => string;
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'text';
}
```

### 4. lib/mcp-auth/server/mcp-server.ts - Main Server Class

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ServerConfig } from './config.js';
import type { RequestContext } from '../types.js';

/**
 * Configurable MCP Server with authentication support
 */
export class AuthenticatedMCPServer {
  private mcpServer: Server;
  private config: ServerConfig;
  
  constructor(config: ServerConfig) {
    this.config = config;
    this.mcpServer = new Server(
      {
        name: config.name || 'mcp-server',
        version: config.version || '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
  }
  
  /**
   * Register tool handlers with automatic authentication
   */
  registerTool<TArgs = any>(
    name: string,
    handler: (args: TArgs, accessToken: string, userId: string) => Promise<string>
  ) {
    // Wrapper that handles auth before calling handler
    const authenticatedHandler = async (args: TArgs, context: RequestContext) => {
      // 1. Authenticate request
      const authResult = await this.config.authProvider.authenticate(context);
      
      if (!authResult.authenticated || !authResult.userId) {
        throw new Error(authResult.error || 'Authentication failed');
      }
      
      // 2. Resolve resource token
      const accessToken = await this.config.tokenResolver.resolveToken(
        authResult.userId,
        this.config.resourceType
      );
      
      if (!accessToken) {
        throw new Error(`No ${this.config.resourceType} token found for user`);
      }
      
      // 3. Call actual handler with token
      return handler(args, accessToken, authResult.userId);
    };
    
    // Register with MCP server
    // ... implementation
  }
  
  /**
   * Start the server
   */
  async start() {
    await this.config.authProvider.initialize?.();
    // ... start transport
  }
  
  /**
   * Stop the server
   */
  async stop() {
    await this.config.authProvider.cleanup?.();
    // ... stop transport
  }
}
```

## Usage in agentbase

### src/index.ts - Using lib/mcp-auth

```typescript
import { AuthenticatedMCPServer } from '../lib/mcp-auth/server/index.js';
import { EnvAuthProvider } from '../lib/mcp-auth/auth/providers/env-provider.js';
import { SimpleTokenResolver } from '../lib/mcp-auth/auth/providers/simple-resolver.js';
import { InstagramClient } from './instagram-client.js';
import { handleGetProfile } from './tools/get-profile.js';

// Simple env-based auth (backward compatible)
const authProvider = new EnvAuthProvider({
  tokenEnvVar: 'INSTAGRAM_ACCESS_TOKEN'
});

// Simple token resolver (returns same token for all users)
const tokenResolver = new SimpleTokenResolver({
  tokenEnvVar: 'INSTAGRAM_ACCESS_TOKEN'
});

// Create server
const server = new AuthenticatedMCPServer({
  name: 'agentbase',
  version: '1.0.0',
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: {
    type: 'stdio'
  }
});

// Register tools
server.registerTool('instagram_get_profile', async (args, accessToken, userId) => {
  const client = new InstagramClient(accessToken);
  return handleGetProfile(client, args);
});

// Start
await server.start();
```

## Example: Multi-Tenant JWT Server

### examples/jwt-multi-tenant/server.ts

```typescript
import { AuthenticatedMCPServer } from '@prmichaelsen/agentbase/lib/mcp-auth';
import { JWTAuthProvider } from './auth-provider.js';
import { DatabaseTokenResolver } from './token-resolver.js';

// JWT auth provider
const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET!,
  database: {
    host: 'localhost',
    database: 'tenants'
  }
});

// Database token resolver
const tokenResolver = new DatabaseTokenResolver({
  database: {
    host: 'localhost',
    database: 'tenants'
  }
});

// Create server
const server = new AuthenticatedMCPServer({
  name: 'agentbase-multi-tenant',
  version: '1.0.0',
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: {
    type: 'sse',
    port: 3000,
    basePath: '/mcp'
  },
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000 // 1 hour
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  }
});

// Register all Instagram tools
// ... (same as before)

await server.start();
console.log('Multi-tenant MCP server running on http://localhost:3000/mcp');
```

### examples/jwt-multi-tenant/auth-provider.ts

```typescript
import { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/agentbase/lib/mcp-auth';
import jwt from 'jsonwebtoken';
import pg from 'pg';

export class JWTAuthProvider implements AuthProvider {
  private db: pg.Pool;
  private jwtSecret: string;
  
  constructor(config: { jwtSecret: string; database: pg.PoolConfig }) {
    this.jwtSecret = config.jwtSecret;
    this.db = new pg.Pool(config.database);
  }
  
  async initialize() {
    await this.db.connect();
  }
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Extract JWT from Authorization header
      const authHeader = context.headers?.['authorization'];
      if (!authHeader || Array.isArray(authHeader)) {
        return { authenticated: false, error: 'No authorization header' };
      }
      
      const token = authHeader.split(' ')[1];
      if (!token) {
        return { authenticated: false, error: 'No token provided' };
      }
      
      // Verify JWT
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      
      // Check if user exists
      const result = await this.db.query(
        'SELECT id FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.rows.length === 0) {
        return { authenticated: false, error: 'User not found' };
      }
      
      return {
        authenticated: true,
        userId: decoded.userId
      };
    } catch (error) {
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  async cleanup() {
    await this.db.end();
  }
}
```

### examples/jwt-multi-tenant/token-resolver.ts

```typescript
import { ResourceTokenResolver } from '@prmichaelsen/agentbase/lib/mcp-auth';
import pg from 'pg';

export class DatabaseTokenResolver implements ResourceTokenResolver {
  private db: pg.Pool;
  
  constructor(config: { database: pg.PoolConfig }) {
    this.db = new pg.Pool(config.database);
  }
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    const result = await this.db.query(
      'SELECT access_token FROM instagram_credentials WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].access_token;
  }
  
  async refreshToken(userId: string, resourceType: string): Promise<string | null> {
    // Implement token refresh logic
    // ...
    return null;
  }
}
```

## Future Package Structure

When extracted to `@prmichaelsen/mcp-auth`:

```json
{
  "name": "@prmichaelsen/mcp-auth",
  "version": "1.0.0",
  "description": "Authentication and multi-tenancy framework for MCP servers",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./auth": "./dist/auth/index.js",
    "./server": "./dist/server/index.js",
    "./transports": "./dist/transports/index.js",
    "./providers/jwt": "./dist/auth/providers/jwt-provider.js",
    "./providers/oauth": "./dist/auth/providers/oauth-provider.js",
    "./providers/apikey": "./dist/auth/providers/apikey-provider.js"
  },
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "optionalDependencies": {
    "jsonwebtoken": "^9.0.0",
    "express": "^4.18.0"
  }
}
```

Then agentbase would use it:

```json
{
  "name": "@prmichaelsen/agentbase",
  "dependencies": {
    "@prmichaelsen/mcp-auth": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.4"
  }
}
```

## Benefits of lib/mcp-auth/ Structure

1. **Clean separation**: Instagram logic in `src/`, reusable framework in `lib/mcp-auth/`
2. **Easy extraction**: `lib/mcp-auth/` can be copied to new package with minimal changes
3. **Testability**: Framework can be tested independently
4. **Reusability**: Other MCP servers (GitHub, Slack, etc.) can use same framework
5. **Maintainability**: Clear boundaries between framework and application code
6. **Scalable**: Other libs can be added to `lib/` directory (e.g., `lib/analytics/`, `lib/caching/`)

## Migration Path

1. **Phase 1**: Implement `lib/mcp-auth/` in agentbase (current project)
2. **Phase 2**: Use `lib/mcp-auth/` internally, test with examples
3. **Phase 3**: Extract `lib/mcp-auth/` to `@prmichaelsen/mcp-auth` package
4. **Phase 4**: Update agentbase to depend on published package
5. **Phase 5**: Create other MCP servers using the framework

## Summary

The `lib/mcp-auth/` structure provides:
- ✅ **Reusable framework** for any MCP server
- ✅ **Pluggable authentication** via providers
- ✅ **Multi-tenancy support** via token resolvers
- ✅ **Transport agnostic** (stdio, HTTP, SSE)
- ✅ **Easy extraction** to standalone package
- ✅ **Type-safe** TypeScript interfaces
- ✅ **Backward compatible** with existing code
