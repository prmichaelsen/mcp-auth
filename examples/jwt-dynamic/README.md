# JWT Dynamic Example

Complete three-tier MCP authentication example demonstrating:
- **Tenant Manager** - Issues JWTs and manages user credentials
- **Base MCP Package** - Instagram MCP server (unwrapped, reusable)
- **Wrapped MCP Server** - Wraps base package with mcp-auth
- **Mock Instagram API** - Simulates external service

## Architecture

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

## Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm run dev
```

This will start:
- **Tenant Manager** on `http://localhost:3000`
- **MCP Server** on `http://localhost:3001/mcp`
- **Mock Instagram** on `http://localhost:3002`

## Testing the Setup

### 1. Get a JWT Token

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user1"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "userId": "user1",
  "username": "alice"
}
```

### 2. Use JWT with MCP Server

```bash
# Get server info
curl http://localhost:3001/mcp \
  -H "Authorization: Bearer <your-jwt-token>"

# Call a tool (via MCP protocol)
curl -X POST http://localhost:3001/mcp/message \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "instagram_get_profile",
      "arguments": { "username": "alice" }
    }
  }'
```

### 3. Test Direct Instagram API (Optional)

```bash
curl http://localhost:3002/v1/users/alice \
  -H "Authorization: Bearer IGTOKEN_alice_12345"
```

## Available Users

| User ID | Username | Instagram Token |
|---------|----------|-----------------|
| user1   | alice    | IGTOKEN_alice_12345 |
| user2   | bob      | IGTOKEN_bob_67890 |
| user3   | charlie  | IGTOKEN_charlie_11111 |

## Project Structure

```
jwt-dynamic/
├── tenant-manager/      # Issues JWTs, manages credentials
├── instagram-mcp/       # Base Instagram MCP (unwrapped)
├── mcp-server/          # Wraps instagram-mcp with mcp-auth
└── mock-instagram/      # Mock Instagram API
```

## Key Concepts Demonstrated

### 1. Zero Modification Principle

The `instagram-mcp` package is a standard MCP server that knows nothing about mcp-auth:

```typescript
// instagram-mcp/src/index.ts
export { createServer } from './server-factory.js';
```

The `mcp-server` package simply imports and wraps it:

```typescript
// mcp-server/src/index.ts
import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createServer } from 'instagram-mcp';

const wrapped = wrapServer({
  serverFactory: createServer,  // No modifications needed!
  authProvider: new JWTAuthProvider({ ... }),
  tokenResolver: new APITokenResolver({ ... }),
  // ...
});
```

### 2. API-Based Token Resolution

The MCP server doesn't store Instagram tokens. Instead:
1. User sends JWT to MCP server
2. MCP server validates JWT, extracts `userId`
3. MCP server calls tenant manager: `GET /api/credentials/user1/instagram`
4. Tenant manager returns Instagram token
5. MCP server creates Instagram client with token
6. MCP server calls Instagram API

### 3. Multi-Tenancy

Each user gets their own:
- JWT with unique `userId`
- Instagram access token
- Ephemeral MCP server instance (complete isolation)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
SERVICE_TOKEN=service-token-for-mcp-server-auth
TENANT_MANAGER_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
TENANT_MANAGER_PORT=3000
MCP_SERVER_PORT=3001
MOCK_INSTAGRAM_PORT=3002
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start in development mode (with watch)
npm run dev

# Start in production mode
npm run start

# Clean build artifacts
npm run clean
```

## Production Deployment

For production, you would:

1. **Replace mock Instagram** with real Instagram Graph API
2. **Use real database** instead of in-memory Map
3. **Enable HTTPS** for all services
4. **Use environment-specific secrets**
5. **Add monitoring and logging**
6. **Deploy behind load balancer**

See the production examples:
- [@prmichaelsen/agentbase-mcp-server](https://github.com/prmichaelsen/agentbase-mcp-server) - Real Instagram integration
- [agentbase.me](https://agentbase.me) - Live deployment

## Troubleshooting

### Services won't start

Make sure ports 3000, 3001, and 3002 are available:
```bash
lsof -i :3000
lsof -i :3001
lsof -i :3002
```

### JWT validation fails

Check that `JWT_SECRET` matches in both tenant-manager and mcp-server.

### Token resolution fails

Check that `SERVICE_TOKEN` matches in both tenant-manager and mcp-server.

### Instagram API calls fail

Make sure mock-instagram is running on port 3002.

## Learn More

- [mcp-auth Documentation](../../../README.md)
- [Server Wrapping Pattern](../../../agent/server-wrapping-pattern.md)
- [Token Resolution Approaches](../../../agent/token-resolution-approaches.md)
