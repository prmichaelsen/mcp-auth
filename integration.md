# MCP Server Integration with mcp-auth Framework

## Overview

This document describes how to integrate any MCP server library with the `@prmichaelsen/mcp-auth` framework to create an auth-ready, multi-tenant MCP server that can be deployed to GCP or any cloud platform.

## Integration Pattern

The integration follows a simple **wrapper pattern**:

```
┌─────────────────────────────────────────────────────────────┐
│                    Your GCP Project                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  @prmichaelsen/mcp-auth (Framework)                    │ │
│  │  - AuthProvider interface                              │ │
│  │  - ResourceTokenResolver interface                     │ │
│  │  - AuthenticatedMCPServer wrapper                      │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       │                                      │
│  ┌────────────────────▼───────────────────────────────────┐ │
│  │  Your Custom Implementation                            │ │
│  │  - JWTAuthProvider (implements AuthProvider)           │ │
│  │  - DatabaseTokenResolver (implements TokenResolver)    │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       │                                      │
│  ┌────────────────────▼───────────────────────────────────┐ │
│  │  Any MCP Server Library                                │ │
│  │  - @prmichaelsen/agentbase (Instagram)                 │ │
│  │  - @prmichaelsen/github-mcp (GitHub)                   │ │
│  │  - @prmichaelsen/slack-mcp (Slack)                     │ │
│  │  - etc.                                                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step Integration Guide

### Step 1: Project Setup

Create a new GCP project:

```bash
mkdir my-mcp-server-gcp
cd my-mcp-server-gcp
npm init -y
```

Install dependencies:

```json
{
  "name": "my-mcp-server-gcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@prmichaelsen/mcp-auth": "^1.0.0",
    "@prmichaelsen/agentbase": "^1.0.0",  // Or any MCP server
    "pg": "^8.11.0",                       // For PostgreSQL
    "jsonwebtoken": "^9.0.0",              // For JWT auth
    "express": "^4.18.0"                   // Optional: for health checks
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Step 2: Implement AuthProvider

Create your custom authentication provider:

```typescript
// src/auth/jwt-provider.ts
import { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';
import jwt from 'jsonwebtoken';
import pg from 'pg';

export class JWTAuthProvider implements AuthProvider {
  private db: pg.Pool;
  private jwtSecret: string;
  
  constructor(config: { jwtSecret: string; databaseUrl: string }) {
    this.jwtSecret = config.jwtSecret;
    this.db = new pg.Pool({ connectionString: config.databaseUrl });
  }
  
  async initialize() {
    // Connect to database
    await this.db.connect();
    console.log('Auth provider initialized');
  }
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Extract JWT from Authorization header
      const authHeader = context.headers?.['authorization'];
      if (!authHeader || Array.isArray(authHeader)) {
        return { 
          authenticated: false, 
          error: 'Missing authorization header' 
        };
      }
      
      // Parse Bearer token
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        return { 
          authenticated: false, 
          error: 'Invalid authorization format' 
        };
      }
      
      // Verify JWT signature
      const decoded = jwt.verify(token, this.jwtSecret) as { 
        userId: string;
        exp: number;
      };
      
      // Check if user exists in database
      const result = await this.db.query(
        'SELECT id, email FROM users WHERE id = $1 AND active = true',
        [decoded.userId]
      );
      
      if (result.rows.length === 0) {
        return { 
          authenticated: false, 
          error: 'User not found or inactive' 
        };
      }
      
      // Success!
      return {
        authenticated: true,
        userId: decoded.userId,
        metadata: {
          email: result.rows[0].email,
          authenticatedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('Authentication error:', error);
      
      if (error instanceof jwt.TokenExpiredError) {
        return { authenticated: false, error: 'Token expired' };
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return { authenticated: false, error: 'Invalid token' };
      }
      
      return { 
        authenticated: false, 
        error: 'Authentication failed' 
      };
    }
  }
  
  async cleanup() {
    await this.db.end();
    console.log('Auth provider cleaned up');
  }
}
```

### Step 3: Implement ResourceTokenResolver

Map authenticated users to their resource-specific access tokens:

```typescript
// src/auth/token-resolver.ts
import { ResourceTokenResolver } from '@prmichaelsen/mcp-auth';
import pg from 'pg';

export class DatabaseTokenResolver implements ResourceTokenResolver {
  private db: pg.Pool;
  
  constructor(config: { databaseUrl: string }) {
    this.db = new pg.Pool({ connectionString: config.databaseUrl });
  }
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    try {
      // Query database for user's resource token
      const result = await this.db.query(
        `SELECT access_token, expires_at 
         FROM ${resourceType}_credentials 
         WHERE user_id = $1 AND expires_at > NOW()`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        console.warn(`No ${resourceType} token found for user ${userId}`);
        return null;
      }
      
      return result.rows[0].access_token;
      
    } catch (error) {
      console.error(`Error resolving ${resourceType} token:`, error);
      return null;
    }
  }
  
  async refreshToken(userId: string, resourceType: string): Promise<string | null> {
    try {
      // Get refresh token
      const result = await this.db.query(
        `SELECT refresh_token FROM ${resourceType}_credentials WHERE user_id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const refreshToken = result.rows[0].refresh_token;
      
      // Call resource API to refresh token
      // (Implementation depends on the resource - Instagram, GitHub, etc.)
      const newAccessToken = await this.refreshResourceToken(resourceType, refreshToken);
      
      if (newAccessToken) {
        // Update database with new token
        await this.db.query(
          `UPDATE ${resourceType}_credentials 
           SET access_token = $1, expires_at = NOW() + INTERVAL '60 days'
           WHERE user_id = $2`,
          [newAccessToken, userId]
        );
      }
      
      return newAccessToken;
      
    } catch (error) {
      console.error(`Error refreshing ${resourceType} token:`, error);
      return null;
    }
  }
  
  private async refreshResourceToken(resourceType: string, refreshToken: string): Promise<string | null> {
    // Resource-specific refresh logic
    // For Instagram:
    if (resourceType === 'instagram') {
      const response = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`
      );
      const data = await response.json();
      return data.access_token || null;
    }
    
    // Add other resources as needed
    return null;
  }
}
```

### Step 4: Wire Everything Together

Create the main entry point:

```typescript
// src/index.ts
import { AuthenticatedMCPServer } from '@prmichaelsen/mcp-auth';
import { JWTAuthProvider } from './auth/jwt-provider.js';
import { DatabaseTokenResolver } from './auth/token-resolver.js';

// Configuration from environment variables
const config = {
  jwtSecret: process.env.JWT_SECRET!,
  databaseUrl: process.env.DATABASE_URL!,
  port: parseInt(process.env.PORT || '8080'),
  resourceType: process.env.RESOURCE_TYPE || 'instagram'
};

// Validate required config
if (!config.jwtSecret || !config.databaseUrl) {
  console.error('Missing required environment variables: JWT_SECRET, DATABASE_URL');
  process.exit(1);
}

// Create auth provider
const authProvider = new JWTAuthProvider({
  jwtSecret: config.jwtSecret,
  databaseUrl: config.databaseUrl
});

// Create token resolver
const tokenResolver = new DatabaseTokenResolver({
  databaseUrl: config.databaseUrl
});

// Create authenticated MCP server
const server = new AuthenticatedMCPServer({
  name: 'my-mcp-server-gcp',
  version: '1.0.0',
  authProvider,
  tokenResolver,
  resourceType: config.resourceType,
  transport: {
    type: 'sse',
    port: config.port,
    host: '0.0.0.0',
    basePath: '/mcp'
  },
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (context) => {
        // Rate limit per user
        return context.metadata?.userId as string || 'anonymous';
      }
    },
    logging: {
      enabled: true,
      level: process.env.LOG_LEVEL as any || 'info',
      format: 'json'
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

// Start server
async function main() {
  try {
    await server.start();
    console.log(`✅ MCP server running on http://0.0.0.0:${config.port}/mcp`);
    console.log(`   Resource type: ${config.resourceType}`);
    console.log(`   Transport: SSE`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
```

### Step 5: Database Schema

Set up your PostgreSQL database:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Instagram credentials (example)
CREATE TABLE instagram_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX idx_instagram_credentials_user_id ON instagram_credentials(user_id);
CREATE INDEX idx_instagram_credentials_expires_at ON instagram_credentials(expires_at);

-- API usage tracking (optional)
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  tool_name VARCHAR(100) NOT NULL,
  request_count INTEGER DEFAULT 1,
  last_called_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
```

### Step 6: Dockerfile for GCP Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user
USER node

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "dist/index.js"]
```

### Step 7: Deploy to GCP Cloud Run

```bash
# Build and deploy
gcloud run deploy my-mcp-server \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars JWT_SECRET=$JWT_SECRET \
  --set-env-vars DATABASE_URL=$DATABASE_URL \
  --set-env-vars RESOURCE_TYPE=instagram \
  --set-env-vars LOG_LEVEL=info \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 1
```

Or use Cloud Build:

```yaml
# cloudbuild.yaml
steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/my-mcp-server:$COMMIT_SHA', '.']
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/my-mcp-server:$COMMIT_SHA']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'my-mcp-server'
      - '--image=gcr.io/$PROJECT_ID/my-mcp-server:$COMMIT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'

images:
  - 'gcr.io/$PROJECT_ID/my-mcp-server:$COMMIT_SHA'
```

## How It Works

### Request Flow

```
1. Client Request
   ↓
   Headers: { Authorization: "Bearer <jwt-token>" }
   ↓
2. AuthenticatedMCPServer receives request
   ↓
3. Calls authProvider.authenticate(context)
   ↓
4. JWTAuthProvider:
   - Verifies JWT signature
   - Extracts userId from token
   - Checks user exists in database
   - Returns AuthResult { authenticated: true, userId: "..." }
   ↓
5. Calls tokenResolver.resolveToken(userId, 'instagram')
   ↓
6. DatabaseTokenResolver:
   - Queries database for user's Instagram token
   - Returns access token
   ↓
7. MCP Server creates InstagramClient(accessToken)
   ↓
8. Tool handler executes with authenticated client
   ↓
9. Response returned to client
```

### Key Benefits

1. **Zero Business Logic Changes**: The underlying MCP server library (agentbase, github-mcp, etc.) doesn't need any modifications
2. **Pluggable Auth**: Swap JWT for OAuth, API Keys, Firebase, etc. by implementing the interface
3. **Multi-Tenant Ready**: Each user gets their own resource tokens automatically
4. **Rate Limiting**: Built-in per-user rate limiting
5. **Logging**: Structured logging with user context
6. **Scalable**: Stateless design, horizontal scaling on Cloud Run

## Example: Using Multiple MCP Servers

You can wrap multiple MCP servers in one deployment:

```typescript
// src/index.ts
import { AuthenticatedMCPServer } from '@prmichaelsen/mcp-auth';
import { JWTAuthProvider } from './auth/jwt-provider.js';
import { DatabaseTokenResolver } from './auth/token-resolver.js';

// Same auth provider for all servers
const authProvider = new JWTAuthProvider({ ... });
const tokenResolver = new DatabaseTokenResolver({ ... });

// Instagram MCP Server
const instagramServer = new AuthenticatedMCPServer({
  name: 'instagram-mcp',
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: { type: 'sse', port: 8080, basePath: '/mcp/instagram' }
});

// GitHub MCP Server
const githubServer = new AuthenticatedMCPServer({
  name: 'github-mcp',
  authProvider,
  tokenResolver,
  resourceType: 'github',
  transport: { type: 'sse', port: 8080, basePath: '/mcp/github' }
});

// Start both
await Promise.all([
  instagramServer.start(),
  githubServer.start()
]);
```

## Testing

```typescript
// test/integration.test.ts
import { JWTAuthProvider } from '../src/auth/jwt-provider';
import jwt from 'jsonwebtoken';

describe('JWT Auth Integration', () => {
  it('should authenticate valid JWT', async () => {
    const provider = new JWTAuthProvider({
      jwtSecret: 'test-secret',
      databaseUrl: process.env.TEST_DATABASE_URL
    });
    
    const token = jwt.sign({ userId: 'test-user' }, 'test-secret');
    
    const result = await provider.authenticate({
      headers: { authorization: `Bearer ${token}` },
      transport: 'sse',
      timestamp: new Date()
    });
    
    expect(result.authenticated).toBe(true);
    expect(result.userId).toBe('test-user');
  });
});
```

## Summary

**Integration Complexity**: ⭐⭐⭐⭐⭐ (Very Easy)

**Time to Implement**: 1-2 hours
- 30 min: Implement AuthProvider
- 30 min: Implement TokenResolver
- 30 min: Wire everything together
- 30 min: Deploy to GCP

**What You Get**:
- ✅ Multi-tenant MCP server
- ✅ JWT authentication (or any auth scheme)
- ✅ Per-user resource tokens
- ✅ Rate limiting
- ✅ Structured logging
- ✅ Graceful shutdown
- ✅ Health checks
- ✅ Production-ready deployment

The `mcp-auth` framework handles all the complexity - you just provide the auth logic specific to your use case!
