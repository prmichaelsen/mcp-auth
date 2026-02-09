# Multi-Tenant MCP Server Architecture

## Overview

This document describes the architecture for making `@prmichaelsen/agentbase` a **pluggable, auth-agnostic** MCP server that can be deployed as a multi-tenant service.

## Core Design Principles

1. **Separation of Concerns**: `agentbase` provides Instagram API tools; authentication is external
2. **Pluggable Authentication**: Any auth scheme (JWT, OAuth, API Key, Firebase, custom) can be used
3. **Provider Pattern**: Authentication logic is injected via a provider interface
4. **Transport Agnostic**: Works with stdio (local), HTTP, or SSE (remote)
5. **Zero Configuration for Simple Use**: Default to stdio with env var for single-user scenarios

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (User)                         │
│              (Claude Desktop, Custom Client, etc.)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ MCP Protocol (stdio/HTTP/SSE)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Tenant Manager Server                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  HTTP/Express Server (Port 3000)                     │   │
│  │  - Handles auth (JWT/OAuth/API Key)                  │   │
│  │  - Manages user sessions                             │   │
│  │  - Routes to MCP server                              │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │  Auth Provider Implementation                        │   │
│  │  - authenticate(context) → userId + Instagram token  │   │
│  │  - Queries database for user credentials             │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │  @prmichaelsen/agentbase (MCP Server)                │   │
│  │  - Receives authenticated requests                   │   │
│  │  - Creates per-request InstagramClient               │   │
│  │  - Executes Instagram API tools                      │   │
│  └────────────────────┬─────────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────────┘
                        │
                        │ Instagram Graph API
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                  Instagram Graph API v21.0                    │
└───────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Package Structure

```
@prmichaelsen/agentbase/
├── src/
│   ├── index.ts                    # Main entry (stdio mode)
│   ├── server.ts                   # Configurable server factory
│   ├── instagram-client.ts         # Instagram API client
│   ├── auth/
│   │   ├── types.ts                # AuthProvider interface
│   │   └── providers/              # Example implementations
│   │       ├── jwt-provider.ts     # JWT example
│   │       ├── oauth-provider.ts   # OAuth example
│   │       └── apikey-provider.ts  # API Key example
│   └── tools/                      # Instagram tools
└── examples/
    ├── simple-stdio/               # Single-user stdio example
    ├── jwt-server/                 # Multi-tenant JWT example
    └── oauth-server/               # OAuth flow example
```

### 2. Auth Provider Interface

The core abstraction is the `AuthProvider` interface:

```typescript
interface AuthProvider {
  // Called on every MCP request
  authenticate(context: AuthContext): Promise<AuthResult>;
  
  // Optional lifecycle hooks
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
  refreshToken?(userId: string): Promise<string | null>;
}

interface AuthContext {
  headers?: Record<string, string>;  // HTTP headers
  metadata?: Record<string, unknown>; // Additional context
  transport: 'stdio' | 'sse' | 'http';
}

interface AuthResult {
  authenticated: boolean;
  userId?: string;                    // Tenant identifier
  instagramAccessToken?: string;      // User's Instagram token
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 3. Request Flow

```
1. Client Request
   ↓
2. Tenant Manager receives request with auth credentials
   (e.g., Authorization: Bearer <jwt-token>)
   ↓
3. AuthProvider.authenticate(context) is called
   ↓
4. Provider validates credentials:
   - JWT: Verify signature, extract userId
   - OAuth: Validate access token with OAuth server
   - API Key: Lookup key in database
   ↓
5. Provider queries database:
   SELECT instagram_access_token 
   FROM user_credentials 
   WHERE user_id = ?
   ↓
6. Returns AuthResult with userId + instagramAccessToken
   ↓
7. MCP Server creates InstagramClient(instagramAccessToken)
   ↓
8. Tool executes with user-specific client
   ↓
9. Response returned to client
```

## Implementation Scenarios

### Scenario A: Simple Single-User (Current Behavior)

```bash
# User installs package
npm install @prmichaelsen/agentbase

# Sets environment variable
export INSTAGRAM_ACCESS_TOKEN=xxx

# Runs stdio server (no auth needed)
npx agentbase

# Claude Desktop connects via stdio
```

**No changes needed** - backward compatible!

### Scenario B: Multi-Tenant with JWT

```typescript
// tenant-manager/server.ts
import { createMCPServer } from '@prmichaelsen/agentbase';
import { JWTAuthProvider } from './auth/jwt-provider';
import express from 'express';

const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  database: {
    host: 'localhost',
    database: 'tenants'
  }
});

const mcpServer = createMCPServer({
  authProvider,
  transport: {
    type: 'sse',
    port: 3000,
    basePath: '/mcp'
  }
});

await mcpServer.start();
```

**JWT Provider Implementation:**
```typescript
class JWTAuthProvider implements AuthProvider {
  async authenticate(context: AuthContext): Promise<AuthResult> {
    const token = context.headers?.['authorization']?.split(' ')[1];
    
    // Verify JWT
    const decoded = jwt.verify(token, this.jwtSecret);
    const userId = decoded.userId;
    
    // Query database for Instagram token
    const result = await this.db.query(
      'SELECT instagram_access_token FROM credentials WHERE user_id = $1',
      [userId]
    );
    
    return {
      authenticated: true,
      userId,
      instagramAccessToken: result.rows[0].instagram_access_token
    };
  }
}
```

### Scenario C: OAuth Flow

```typescript
// tenant-manager/server.ts
import { createMCPServer } from '@prmichaelsen/agentbase';
import { OAuthProvider } from './auth/oauth-provider';

const authProvider = new OAuthProvider({
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  clientId: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  callbackUrl: 'https://myapp.com/oauth/callback'
});

const mcpServer = createMCPServer({
  authProvider,
  transport: { type: 'sse', port: 3000 }
});
```

**OAuth Provider Implementation:**
```typescript
class OAuthProvider implements AuthProvider {
  async authenticate(context: AuthContext): Promise<AuthResult> {
    const accessToken = context.headers?.['authorization']?.split(' ')[1];
    
    // Validate with OAuth server
    const userInfo = await this.validateToken(accessToken);
    
    // Retrieve Instagram token from database
    const instagramToken = await this.getInstagramToken(userInfo.userId);
    
    return {
      authenticated: true,
      userId: userInfo.userId,
      instagramAccessToken: instagramToken
    };
  }
  
  private async validateToken(token: string) {
    // Call OAuth introspection endpoint
    const response = await fetch(this.introspectionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${token}&client_id=${this.clientId}`
    });
    return response.json();
  }
}
```

### Scenario D: Custom Auth with External Service

```typescript
// tenant-manager/server.ts
class CustomAuthProvider implements AuthProvider {
  async authenticate(context: AuthContext): Promise<AuthResult> {
    const apiKey = context.headers?.['x-api-key'];
    
    // Call external auth service
    const response = await fetch('https://auth-service.com/validate', {
      headers: { 'X-API-Key': apiKey }
    });
    
    const { userId, instagramToken } = await response.json();
    
    return {
      authenticated: true,
      userId,
      instagramAccessToken: instagramToken
    };
  }
}
```

## Multi-Tenancy Database Schema

The tenant manager maintains user-to-Instagram-token mappings:

```sql
-- Users/Tenants table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Instagram credentials per user
CREATE TABLE instagram_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP,
  refresh_token TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Optional: API usage tracking
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  tool_name VARCHAR(100),
  request_count INTEGER DEFAULT 1,
  last_called_at TIMESTAMP DEFAULT NOW()
);
```

## Authentication Schemes Comparison

### JWT (JSON Web Tokens)

**Best for:** Stateless authentication, microservices, API-first applications

**Flow:**
1. User logs in → receives JWT
2. Client includes JWT in `Authorization: Bearer <token>` header
3. Server verifies JWT signature
4. Extracts userId from JWT claims
5. Looks up Instagram token in database

**Pros:**
- Stateless (no session storage)
- Industry standard
- Works well with microservices
- Can include custom claims

**Cons:**
- Token revocation requires additional logic
- Tokens can't be invalidated before expiry (unless using blacklist)

### OAuth 2.0

**Best for:** Third-party integrations, delegated access, enterprise SSO

**Flow:**
1. User redirects to OAuth provider (Google, GitHub, etc.)
2. User authorizes application
3. Application receives access token
4. Client includes token in requests
5. Server validates token with OAuth provider
6. Looks up Instagram token in database

**Pros:**
- Industry standard for delegated access
- Works with existing identity providers
- Built-in token refresh
- Granular scopes/permissions

**Cons:**
- More complex to implement
- Requires OAuth server/provider
- Network call to validate each token (unless cached)

### API Keys

**Best for:** Service-to-service communication, simple integrations

**Flow:**
1. User generates API key in portal
2. Client includes key in `X-API-Key` header
3. Server looks up key in database
4. Retrieves associated userId and Instagram token

**Pros:**
- Simple to implement
- No expiration complexity
- Easy to rotate

**Cons:**
- Less secure (no expiration)
- Requires secure storage
- No built-in refresh mechanism

### Firebase Authentication

**Best for:** Rapid prototyping, mobile apps, managed infrastructure

**Flow:**
1. User authenticates with Firebase (email, Google, etc.)
2. Client receives Firebase ID token
3. Client includes token in requests
4. Server verifies token with Firebase Admin SDK
5. Looks up Instagram token in Firestore

**Pros:**
- Managed authentication service
- Multiple auth providers out of the box
- Real-time database integration
- Good mobile SDKs

**Cons:**
- Vendor lock-in
- Additional costs
- Less control over auth flow

## Recommended Approach: OAuth 2.0 + JWT

**Why this combination?**

1. **OAuth for initial authentication**: Users authenticate via trusted providers (Google, GitHub)
2. **JWT for session management**: After OAuth, issue your own JWT for subsequent requests
3. **Best of both worlds**: Secure initial auth + stateless session management

**Flow:**
```
1. User → OAuth Provider (Google) → Authorization
2. OAuth Provider → Tenant Manager → Authorization code
3. Tenant Manager → OAuth Provider → Exchange code for access token
4. Tenant Manager → Issue JWT with userId
5. Client → Tenant Manager (with JWT) → MCP requests
6. Tenant Manager → Validate JWT → Resolve Instagram token → Execute
```

## Portal for User Management

The tenant manager would provide a web portal:

```
https://agentbase-manager.example.com/

Pages:
- /login                    # OAuth login
- /dashboard                # User dashboard
- /settings/instagram       # Connect Instagram account
- /settings/api-keys        # Generate API keys (optional)
- /usage                    # View API usage stats
```

**Instagram Token Setup Flow:**
1. User logs in via OAuth
2. Navigates to "Connect Instagram"
3. Redirects to Facebook/Instagram OAuth
4. User authorizes application
5. Instagram access token stored in database
6. User can now use MCP server

## Configuration Example

```typescript
// tenant-manager/config.ts
export const config = {
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  
  auth: {
    // OAuth for user login
    oauth: {
      provider: 'google',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: 'https://myapp.com/oauth/callback'
    },
    
    // JWT for session management
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '7d'
    }
  },
  
  database: {
    host: process.env.DB_HOST,
    port: 5432,
    database: 'agentbase_tenants',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  
  instagram: {
    // Instagram OAuth for connecting accounts
    clientId: process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    redirectUri: 'https://myapp.com/instagram/callback'
  },
  
  rateLimit: {
    enabled: true,
    maxRequests: 100,
    windowMs: 60 * 60 * 1000 // 1 hour
  }
};
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer (nginx)                    │
│                    agentbase.example.com                     │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌───────▼──────┐
│  Instance 1  │  │  Instance 2  │  (Horizontal scaling)
│  Port 3000   │  │  Port 3000   │
└───────┬──────┘  └───────┬──────┘
        │                 │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │   PostgreSQL    │
        │   (RDS/Managed) │
        └─────────────────┘
```

## Summary

**Key Benefits:**
1. ✅ **Auth-agnostic**: Use any auth scheme
2. ✅ **Pluggable**: Inject custom providers
3. ✅ **Multi-tenant**: Each user has their own Instagram token
4. ✅ **Scalable**: Stateless design, horizontal scaling
5. ✅ **Backward compatible**: Stdio mode still works
6. ✅ **Flexible**: Works with any identity provider

**Recommended Stack:**
- **Auth**: OAuth 2.0 (Google/GitHub) + JWT
- **Database**: PostgreSQL (user → Instagram token mapping)
- **Transport**: SSE over HTTP
- **Deployment**: Docker + Kubernetes or serverless (AWS Lambda)

**Next Steps:**
1. Implement `AuthProvider` interface in agentbase
2. Create example providers (JWT, OAuth, API Key)
3. Build tenant manager reference implementation
4. Create web portal for user management
5. Document deployment guide
