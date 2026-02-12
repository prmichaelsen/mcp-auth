# Create JWT Dynamic Example

**Priority**: 🟢 MEDIUM  
**Status**: Open  
**Created**: 2026-02-12  
**Type**: Documentation/Example  
**Estimated Effort**: 4-6 hours

## Goal

Create a complete, working three-tier example in `examples/jwt-dynamic/` that demonstrates:
1. **Tenant Manager** - Issues JWTs, provides credentials API
2. **MCP Server** - Wrapped with mcp-auth, resolves tokens via API
3. **Mock Instagram API** - Simulates external API (Instagram)

Users should be able to:
```bash
cd examples/jwt-dynamic
npm install
npm run dev  # Starts all three services
```

## Architecture

Based on real production setup (agentbase.me):

```
┌─────────────────┐
│  Chat Platform  │ (Claude Desktop, etc.)
│  Sends JWT      │
└────────┬────────┘
         │ HTTP + JWT
         ▼
┌─────────────────────────────────┐
│  MCP Server (Port 3001)         │
│  - Validates JWT                │
│  - Calls Tenant Manager API     │
│  - Gets Instagram token         │
│  - Calls Instagram API          │
└────────┬────────────────────────┘
         │ HTTP + Service Token
         ▼
┌─────────────────────────────────┐
│  Tenant Manager (Port 3000)     │
│  - Issues JWTs                  │
│  - Stores user credentials      │
│  - Provides /api/credentials    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Mock Instagram API (Port 3002) │
│  - Simulates Instagram          │
│  - Returns mock data            │
└─────────────────────────────────┘
```

## Directory Structure

```
examples/jwt-dynamic/
├── README.md                    # Complete setup guide
├── package.json                 # Root package with scripts
├── .env.example                 # Example environment variables
├── docker-compose.yml           # Optional Docker setup
│
├── tenant-manager/              # Tier 2: Tenant Manager
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Express server
│   │   ├── auth.ts             # JWT issuing
│   │   ├── credentials.ts      # Credentials API
│   │   └── db.ts               # In-memory database
│   └── README.md
│
├── instagram-mcp/               # Base MCP Package (unwrapped)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Export createServer
│   │   ├── server-factory.ts   # Instagram MCP server
│   │   └── instagram-client.ts # Instagram API client
│   └── README.md
│
├── mcp-server/                  # Tier 3: Wrapped MCP Server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── index.ts            # Wraps instagram-mcp with mcp-auth
│   └── README.md
│
├── mock-instagram/              # Mock External API
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── index.ts            # Mock Instagram API
│   └── README.md
│
└── scripts/
    ├── setup.sh                # Setup script
    ├── start-all.sh            # Start all services
    └── test.sh                 # Test the setup
```

## Implementation Plan

### Phase 1: Project Setup (1 hour)

1. Create directory structure
2. Root package.json with workspace scripts
3. Shared TypeScript config
4. Environment variable template

### Phase 2: Mock Instagram API (30 min)

Simple Express server that returns mock data:

```typescript
// mock-instagram/src/index.ts
import express from 'express';

const app = express();

app.get('/v1/users/:username', (req, res) => {
  const { username } = req.params;
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token || !token.startsWith('IGTOKEN_')) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  res.json({
    id: '123456',
    username,
    full_name: `${username} (Mock)`,
    profile_picture: 'https://via.placeholder.com/150',
    followers_count: 1234,
    following_count: 567
  });
});

app.listen(3002, () => {
  console.log('Mock Instagram API running on http://localhost:3002');
});
```

### Phase 3: Tenant Manager (2 hours)

Express server with:
- JWT issuing endpoint
- Credentials storage (in-memory)
- Credentials API endpoint

```typescript
// tenant-manager/src/index.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import { credentialsRouter } from './credentials.js';

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'service-token-123';

// In-memory user database
const users = new Map([
  ['user1', { 
    id: 'user1', 
    username: 'alice',
    credentials: {
      instagram: 'IGTOKEN_alice_12345'
    }
  }],
  ['user2', { 
    id: 'user2', 
    username: 'bob',
    credentials: {
      instagram: 'IGTOKEN_bob_67890'
    }
  }]
]);

// Issue JWT endpoint
app.post('/api/auth/token', (req, res) => {
  const { userId } = req.body;
  
  if (!users.has(userId)) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const token = jwt.sign(
    { sub: userId, userId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  res.json({ token, expiresIn: 3600 });
});

// Credentials API (for MCP server)
app.get('/api/credentials/:userId/:resourceType', (req, res) => {
  const { userId, resourceType } = req.params;
  const authHeader = req.headers.authorization;
  
  // Verify service token
  if (authHeader !== `Bearer ${SERVICE_TOKEN}`) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const token = user.credentials[resourceType];
  if (!token) {
    return res.status(404).json({ error: 'Credentials not found' });
  }
  
  res.json({
    userId,
    resourceType,
    accessToken: token,
    expiresAt: Date.now() + 3600000
  });
});

app.listen(3000, () => {
  console.log('Tenant Manager running on http://localhost:3000');
  console.log('Available users: user1 (alice), user2 (bob)');
});
```

### Phase 4a: Base Instagram MCP Package (1 hour)

Unwrapped Instagram MCP server (can be used standalone):

```typescript
// instagram-mcp/src/index.ts
export { createServer } from './server-factory.js';
```

```typescript
// instagram-mcp/src/server-factory.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { InstagramClient } from './instagram-client.js';

export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'instagram-mcp',
    version: '1.0.0'
  });
  
  const client = new InstagramClient(accessToken);
  
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_profile',
        description: 'Get Instagram profile',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string' }
          },
          required: ['username']
        }
      }
    ]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'get_profile') {
      const profile = await client.getProfile(request.params.arguments.username);
      return {
        content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }]
      };
    }
    throw new Error('Unknown tool');
  });
  
  return server;
}
```

```typescript
// instagram-mcp/src/instagram-client.ts
export class InstagramClient {
  constructor(private accessToken: string) {}
  
  async getProfile(username: string) {
    const response = await fetch(
      `http://localhost:3002/v1/users/${username}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.statusText}`);
    }
    
    return response.json();
  }
}
```

### Phase 4b: Wrapped MCP Server (1 hour)

Wraps the base Instagram MCP with mcp-auth:

```typescript
// mcp-server/src/index.ts
import { wrapServer, JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';
import { createServer } from 'instagram-mcp';

const wrapped = wrapServer({
  serverFactory: createServer,
  
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-key'
  }),
  
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: process.env.TENANT_MANAGER_URL || 'http://localhost:3000',
    serviceToken: process.env.SERVICE_TOKEN || 'service-token-123'
  }),
  
  resourceType: 'instagram',
  
  transport: {
    type: 'sse',
    port: 3001,
    cors: true,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001'
  }
});

wrapped.start().then(() => {
  console.log('MCP Server running on http://localhost:3001/mcp');
});
```

**Key Point**: The mcp-server package is minimal - it just imports the base `instagram-mcp` package and wraps it with mcp-auth. This demonstrates the "zero modification" principle!

### Phase 5: Documentation & Scripts (1 hour)

#### Root README.md

```markdown
# JWT Dynamic Example

Complete three-tier MCP authentication example with:
- Tenant Manager (issues JWTs, manages credentials)
- MCP Server (wrapped with mcp-auth)
- Mock Instagram API (simulates external service)

## Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm run dev
```

## Testing

```bash
# Get JWT for user1
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1"}'

# Use JWT with MCP server
curl http://localhost:3001/mcp \
  -H "Authorization: Bearer <jwt-token>"
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation.

## Available Users

- `user1` (alice) - Instagram token: `IGTOKEN_alice_12345`
- `user2` (bob) - Instagram token: `IGTOKEN_bob_67890`
```

#### Root package.json

```json
{
  "name": "jwt-dynamic-example",
  "private": true,
  "workspaces": [
    "tenant-manager",
    "mcp-server",
    "mock-instagram"
  ],
  "scripts": {
    "install:all": "npm install && npm install --workspaces",
    "build": "npm run build --workspaces",
    "dev": "concurrently \"npm run dev -w mock-instagram\" \"npm run dev -w tenant-manager\" \"npm run dev -w mcp-server\"",
    "start": "concurrently \"npm start -w mock-instagram\" \"npm start -w tenant-manager\" \"npm start -w mcp-server\"",
    "clean": "npm run clean --workspaces && rm -rf node_modules"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

## Benefits

1. **Complete Working Example**: Users can run it immediately
2. **Educational**: Shows all three tiers clearly
3. **Testable**: Includes test scripts
4. **Realistic**: Based on production architecture
5. **Self-Contained**: No external dependencies
6. **Well-Documented**: README for each component

## Acceptance Criteria

- [ ] All three services start with `npm run dev`
- [ ] User can get JWT from tenant manager
- [ ] User can call MCP server with JWT
- [ ] MCP server resolves Instagram token via API
- [ ] MCP server calls mock Instagram API
- [ ] Complete documentation for each component
- [ ] Test script validates the setup
- [ ] Works on fresh clone

## Related

- Production example: agentbase.me
- Pattern: Server Wrapping (Dynamic Mode)
- Auth: JWT + API-based token resolution
