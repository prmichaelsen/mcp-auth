# MCP Platform Pattern - Multi-Tenant Architecture

## Overview

This document describes the **MCP Platform Pattern** - a reusable architectural pattern for building multi-tenant MCP (Model Context Protocol) platforms that can host multiple integration servers (Instagram, GitHub, Slack, etc.) with centralized authentication and user management.

## The Pattern

### Core Concept

**Separate the platform (authentication, user management) from the integration servers (business logic)**

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Platform                              │
│  - User authentication (OAuth + JWT)                         │
│  - Integration credential storage                            │
│  - User management portal                                    │
│  - Usage tracking & billing                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Provides: JWT tokens + credential resolution
                     │
        ┌────────────┼────────────┬────────────┐
        │            │            │            │
┌───────▼──────┐ ┌──▼──────┐ ┌──▼──────┐ ┌──▼──────┐
│  Instagram   │ │  GitHub │ │  Slack  │ │  Other  │
│  MCP Server  │ │   MCP   │ │   MCP   │ │   MCP   │
│              │ │  Server │ │  Server │ │  Server │
└──────────────┘ └─────────┘ └─────────┘ └─────────┘
```

## Architecture Components

### 1. Platform Layer (Shared)

**Responsibilities:**
- User registration and authentication
- OAuth integration for platform login (Google, GitHub, etc.)
- Integration credential management (Instagram, GitHub, Slack tokens)
- JWT issuance for MCP server access
- Web portal for user management
- Usage tracking and billing

**Technology:**
- Frontend: Next.js, React
- Backend: Express.js, Fastify
- Database: PostgreSQL (Cloud SQL)
- Auth: NextAuth.js, OAuth 2.0, JWT

### 2. Integration Servers (Per-Integration)

**Responsibilities:**
- Validate JWT tokens from platform
- Resolve user credentials from platform database
- Execute integration-specific API calls
- Return results to MCP clients

**Technology:**
- Framework: `@prmichaelsen/mcp-auth`
- Transport: SSE over HTTP
- Hosting: Cloud Run (serverless) or GKE (Kubernetes)

## Database Schema Pattern

### Shared Platform Tables

```sql
-- Users (single source of truth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  oauth_provider VARCHAR(50), -- 'google', 'github' (for platform login)
  oauth_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- MCP Applications registry
CREATE TABLE mcp_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL, -- 'agentbase', 'github-mcp'
  display_name VARCHAR(255) NOT NULL,
  endpoint_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User's connected apps
CREATE TABLE user_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  app_id UUID REFERENCES mcp_apps(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  connected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);
```

### Integration-Specific Credential Tables

**Key Decision: One table per integration (not generic JSONB)**

```sql
-- Instagram credentials (for agentbase)
CREATE TABLE instagram_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMP,
  refresh_token TEXT,
  instagram_user_id VARCHAR(255),
  instagram_username VARCHAR(255),
  scopes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- GitHub credentials (for github-mcp)
CREATE TABLE github_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  scopes TEXT[],
  github_user_id INTEGER,
  github_username VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Slack credentials (for slack-mcp)
CREATE TABLE slack_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  team_id VARCHAR(255),
  team_name VARCHAR(255),
  bot_user_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, team_id) -- User can connect multiple workspaces
);
```

**Why separate tables?**
- ✅ Type-safe: Proper typed columns
- ✅ Performant: Direct column access with indexes
- ✅ Maintainable: Clear schema per integration
- ✅ Scalable: Each integration scales independently

### Generic Usage Tracking

```sql
-- API usage (generic across all apps)
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  app_id UUID REFERENCES mcp_apps(id),
  tool_name VARCHAR(100),
  response_time_ms INTEGER,
  status VARCHAR(20), -- 'success', 'error'
  called_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_app_called (user_id, app_id, called_at)
);
```

## Authentication Flow

### 1. User Registration & Platform Login

```
1. User visits platform portal
   ↓
2. Clicks "Sign in with Google/GitHub"
   ↓
3. OAuth provider authenticates user
   ↓
4. Platform creates/updates user record
   ↓
5. Platform issues JWT token
   ↓
6. User stores JWT for MCP client configuration
```

### 2. Integration Connection (e.g., Instagram)

```
1. User navigates to "Connect Instagram" in portal
   ↓
2. Platform redirects to Instagram OAuth
   ↓
3. User authorizes Instagram access
   ↓
4. Platform receives Instagram access token
   ↓
5. Platform stores token in instagram_credentials table
   ↓
6. User can now use Instagram MCP server
```

### 3. MCP Request Flow

```
1. MCP Client sends request with JWT
   ↓
2. Integration server validates JWT
   ↓
3. Extracts userId from JWT
   ↓
4. Queries platform DB for integration credentials
   SELECT access_token FROM instagram_credentials WHERE user_id = ?
   ↓
5. Creates integration client with user's token
   ↓
6. Executes API call
   ↓
7. Returns result to client
```

## Implementation Pattern

### Platform API (Express.js)

```typescript
// platform/src/server.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const app = express();
const db = new Pool({ /* config */ });

// OAuth callback (Google/GitHub)
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  // Exchange code for user info
  const userInfo = await exchangeOAuthCode(code);
  
  // Create/update user
  const user = await db.query(
    `INSERT INTO users (email, oauth_provider, oauth_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET last_login_at = NOW()
     RETURNING *`,
    [userInfo.email, 'google', userInfo.id]
  );
  
  // Issue JWT
  const token = jwt.sign(
    { userId: user.rows[0].id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  res.json({ token, user: user.rows[0] });
});

// Instagram OAuth callback
app.get('/integrations/instagram/callback', async (req, res) => {
  const { code } = req.query;
  const userId = req.user.id; // From auth middleware
  
  // Exchange code for Instagram token
  const instagramToken = await exchangeInstagramCode(code);
  
  // Store credentials
  await db.query(
    `INSERT INTO instagram_credentials (user_id, access_token, instagram_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET access_token = $2`,
    [userId, instagramToken.access_token, instagramToken.user_id]
  );
  
  res.redirect('/dashboard?instagram=connected');
});
```

### Integration Server (agentbase)

```typescript
// agentbase-mcp-server/src/index.ts
import { AuthenticatedMCPServer } from '@prmichaelsen/mcp-auth';
import { JWTAuthProvider } from '@prmichaelsen/mcp-auth/providers/jwt';
import { DatabaseTokenResolver } from './auth/database-token-resolver.js';

// JWT auth provider (validates JWT from platform)
const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  database: {
    host: process.env.PLATFORM_DB_HOST,
    database: process.env.PLATFORM_DB_NAME
  }
});

// Token resolver (queries platform DB for Instagram token)
const tokenResolver = new DatabaseTokenResolver({
  database: {
    host: process.env.PLATFORM_DB_HOST,
    database: process.env.PLATFORM_DB_NAME
  }
});

// Create MCP server
const server = new AuthenticatedMCPServer({
  name: 'agentbase',
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: {
    type: 'sse',
    port: 8080,
    basePath: '/mcp'
  }
});

// Register tools
server.registerTool('instagram_get_profile', withAuth(async (args, accessToken, userId) => {
  const client = new InstagramClient(accessToken);
  return client.getProfile(args.userId);
}));

await server.start();
```

### Token Resolver Implementation

```typescript
// agentbase-mcp-server/src/auth/database-token-resolver.ts
import { ResourceTokenResolver } from '@prmichaelsen/mcp-auth';
import { Pool } from 'pg';

export class DatabaseTokenResolver implements ResourceTokenResolver {
  private db: Pool;
  
  constructor(config: { database: any }) {
    this.db = new Pool(config.database);
  }
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    if (resourceType !== 'instagram') {
      return null;
    }
    
    const result = await this.db.query(
      'SELECT access_token FROM instagram_credentials WHERE user_id = $1',
      [userId]
    );
    
    return result.rows[0]?.access_token || null;
  }
}
```

## Deployment Pattern

### Cloud Run (Recommended)

```yaml
# Platform
platform-api:
  image: gcr.io/project/platform-api
  port: 3000
  env:
    - JWT_SECRET
    - DB_HOST
    - GOOGLE_CLIENT_ID
    - INSTAGRAM_CLIENT_ID

# Integration Servers
agentbase-mcp-server:
  image: gcr.io/project/agentbase-mcp-server
  port: 8080
  env:
    - JWT_SECRET
    - PLATFORM_DB_HOST

github-mcp-server:
  image: gcr.io/project/github-mcp-server
  port: 8080
  env:
    - JWT_SECRET
    - PLATFORM_DB_HOST
```

## Benefits of This Pattern

### 1. Separation of Concerns
- Platform handles auth, user management
- Integration servers focus on business logic
- Clear boundaries and responsibilities

### 2. Scalability
- Each integration server scales independently
- Platform scales separately from integrations
- Can add new integrations without affecting existing ones

### 3. Multi-Tenancy
- Single user table shared across all integrations
- Per-user credentials for each integration
- Centralized usage tracking and billing

### 4. Security
- JWT tokens issued by platform
- Integration servers validate tokens
- Credentials stored securely in platform DB
- No credential duplication

### 5. Developer Experience
- Clear pattern to follow for new integrations
- Reusable `@prmichaelsen/mcp-auth` framework
- Type-safe database schema
- Easy to add new integrations

## Adding a New Integration

### 1. Create Credential Table

```sql
CREATE TABLE twitter_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  access_token_secret TEXT NOT NULL,
  twitter_user_id VARCHAR(255),
  twitter_username VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### 2. Register App in Platform

```sql
INSERT INTO mcp_apps (name, display_name, endpoint_url)
VALUES ('twitter-mcp', 'Twitter MCP Server', 'https://twitter-mcp.run.app/mcp');
```

### 3. Add OAuth Flow to Platform

```typescript
// platform/src/routes/twitter.ts
app.get('/integrations/twitter/callback', async (req, res) => {
  const { code } = req.query;
  const userId = req.user.id;
  
  const twitterToken = await exchangeTwitterCode(code);
  
  await db.query(
    `INSERT INTO twitter_credentials (user_id, access_token, access_token_secret)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET access_token = $2`,
    [userId, twitterToken.access_token, twitterToken.access_token_secret]
  );
  
  res.redirect('/dashboard?twitter=connected');
});
```

### 4. Create Integration Server

```typescript
// twitter-mcp-server/src/index.ts
import { AuthenticatedMCPServer } from '@prmichaelsen/mcp-auth';

const server = new AuthenticatedMCPServer({
  name: 'twitter-mcp',
  authProvider: new JWTAuthProvider({ /* config */ }),
  tokenResolver: new TwitterTokenResolver({ /* config */ }),
  resourceType: 'twitter',
  transport: { type: 'sse', port: 8080 }
});

server.registerTool('twitter_post_tweet', withAuth(async (args, accessToken, userId) => {
  const client = new TwitterClient(accessToken);
  return client.postTweet(args.text);
}));

await server.start();
```

### 5. Deploy

```bash
# Build and deploy
docker build -t gcr.io/project/twitter-mcp-server .
gcloud run deploy twitter-mcp-server --image gcr.io/project/twitter-mcp-server
```

**Done!** New integration is live with zero changes to existing code.

## Summary

The **MCP Platform Pattern** provides:

✅ **Centralized authentication** - One platform, multiple integrations
✅ **Multi-tenancy** - Each user has separate credentials per integration
✅ **Scalability** - Platform and integrations scale independently
✅ **Type safety** - Proper database schema per integration
✅ **Reusability** - `@prmichaelsen/mcp-auth` framework for all integrations
✅ **Easy extension** - Add new integrations without affecting existing ones
✅ **Clear separation** - Platform handles auth, integrations handle business logic

This pattern enables building a production-ready, multi-tenant MCP platform that can host unlimited integrations with proper authentication, user management, and scalability.
