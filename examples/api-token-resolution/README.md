# Server Wrapping with API-Based Token Resolution

This example demonstrates the **recommended production pattern**: wrapping an existing MCP server with JWT authentication and API-based token resolution.

## Overview

- **Pattern**: Server wrapping (zero-modification)
- **Auth**: JWT validation
- **Token Resolution**: API-based (calls tenant manager)
- **Transport**: SSE (remote multi-tenant)
- **Use case**: Production multi-tenant deployment

## Architecture

```
Chat Platform (with JWT)
  ↓
MCP Server Instance (this example)
  ├─ Validates JWT → userId
  ├─ Calls Tenant Manager API → accessToken
  └─ Creates ephemeral MCP server → executes tool
```

## Setup

1. Install dependencies:
```bash
cd examples/api-token-resolution
npm install
```

2. Set environment variables:
```bash
export JWT_SECRET="your-shared-jwt-secret"
export TENANT_MANAGER_URL="https://tenant-manager.example.com"
export SERVICE_TOKEN="service-token-for-api-auth"
```

3. Run the server:
```bash
npm start
```

## How It Works

1. **Client sends request** with JWT in Authorization header
2. **JWTAuthProvider** validates JWT and extracts userId
3. **APITokenResolver** calls tenant manager API:
   ```
   GET /api/credentials/:userId/:resourceType
   Authorization: Bearer <service-token>
   ```
4. **Tenant manager returns** the user's resource token
5. **wrapServer** creates ephemeral MCP server with that token
6. **Tool executes** with user-specific token
7. **Response returned** to client

## Benefits of This Approach

✅ **Automatic token refresh** - Tenant manager can rotate tokens anytime
✅ **Immediate revocation** - Revoke tokens by updating API response
✅ **Better security** - Tokens never exposed in JWT
✅ **Small JWT** - Only contains user ID (~200 bytes)
✅ **Centralized control** - All token access goes through tenant manager
✅ **Caching** - Tokens cached for 5 minutes to reduce API calls

## Tenant Manager API Contract

Your tenant manager must provide this endpoint:

```typescript
// GET /api/credentials/:userId/:resourceType
// Authorization: Bearer <service-token>

app.get('/api/credentials/:userId/:resourceType', authenticateService, async (req, res) => {
  const { userId, resourceType } = req.params;
  
  // Query your database
  const token = await db.query(
    'SELECT access_token FROM credentials WHERE user_id = $1 AND resource_type = $2',
    [userId, resourceType]
  );
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({
    accessToken: token.access_token,
    expiresAt: token.expires_at
  });
});
```

## Code Structure

- `index.ts` - Server wrapping implementation
- `mock-server.ts` - Mock MCP server (replace with real server)
- `package.json` - Dependencies
- `.env.example` - Environment variables

## Testing

```bash
# Test with curl
curl -X POST http://localhost:3000/mcp/message \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "get_data", "arguments": {"id": "123"}}}'
```
