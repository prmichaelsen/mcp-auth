# Token Resolution Architecture

## Core Principle

**The MCP Server Instance does NOT access the Tenant Manager's database directly.**

All credential resolution happens through:
1. **API calls** to tenant manager (RECOMMENDED)
2. **JWT tokens** (embedded credentials)

## Supported Approaches

### Approach 1: API-Based Resolution ⭐ RECOMMENDED FOR PRODUCTION

The tenant manager provides an **API endpoint** for token resolution:

```
┌─────────────────────────────────────────────────────────────┐
│                  Tenant Manager                              │
│                                                              │
│  Issues JWT: { userId: "user-123" }                          │
│                                                              │
│  Provides API:                                               │
│    GET /api/credentials/:userId/:resourceType                │
│    Authorization: Bearer <service-token>                     │
│    → { accessToken: "IGQVJXabc..." }                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ JWT + API
                     │
┌────────────────────▼─────────────────────────────────────────┐
│              MCP Server Instance                             │
│                                                              │
│  1. AuthProvider validates JWT → userId                      │
│                                                              │
│  2. TokenResolver calls tenant manager API                   │
│     → GET /api/credentials/user-123/instagram                │
│     → Returns: { accessToken: "IGQVJXabc..." }               │
│                                                              │
│  API CALL (no direct DB access)                              │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
import { wrapServer, JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';

const wrapped = wrapServer({
  serverFactory: createInstagramServer,
  
  // Validates JWT (just extracts userId)
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.SHARED_JWT_SECRET
  }),
  
  // Calls tenant manager API for token
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: process.env.TENANT_MANAGER_URL,
    serviceToken: process.env.SERVICE_TOKEN,
    cacheTokens: true, // Cache for 5 minutes
    cacheTtl: 300000
  }),
  
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});
```

**Why This is Better:**

| Benefit | Explanation |
|---------|-------------|
| **Automatic Token Refresh** | Tenant manager can rotate tokens without issuing new JWTs |
| **Token Revocation** | Revoke tokens immediately by updating API response |
| **Better Security** | Tokens never exposed in JWT payload |
| **Small JWT Size** | JWT only contains user ID (~200 bytes) |
| **Centralized Control** | Tenant manager controls all token access |
| **Audit Trail** | Log all token access requests |
| **Rate Limiting** | Add rate limits at API level |
| **Caching** | Cache tokens in MCP server for performance |

**Performance:**
- API call: ~5-20ms
- With caching: 0ms (cache hit)
- Total overhead: Negligible with proper caching

### Approach 2: JWT with Embedded Token (For MVP/Prototyping)

The tenant manager includes the resource token **inside the JWT**:

```
┌─────────────────────────────────────────────────────────────┐
│                  Tenant Manager                              │
│                                                              │
│  User logs in → Issues JWT:                                  │
│  {                                                           │
│    "userId": "user-123",                                     │
│    "tokens": {                                               │
│      "instagram": "IGQVJXabc...",                            │
│      "github": "ghp_abc123..."                               │
│    },                                                        │
│    "exp": 1234567890                                         │
│  }                                                           │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ JWT (contains everything)
                     │
┌────────────────────▼─────────────────────────────────────────┐
│              MCP Server Instance                             │
│                                                              │
│  1. AuthProvider validates JWT                               │
│     → Extracts: userId + tokens                              │
│                                                              │
│  2. TokenResolver returns cached token                       │
│     → No external calls needed                               │
│                                                              │
│  NO API CALLS                                                │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
import { wrapServer, JWTAuthProvider, JWTTokenResolver } from '@prmichaelsen/mcp-auth';

const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.SHARED_JWT_SECRET,
  extractTokens: true // Extract tokens from JWT
});

const wrapped = wrapServer({
  serverFactory: createInstagramServer,
  authProvider,
  tokenResolver: new JWTTokenResolver({ authProvider }),
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});
```

**Trade-offs:**

| Aspect | Pro/Con |
|--------|---------|
| **Performance** | ✅ Zero API calls |
| **Token Refresh** | ❌ Requires new JWT |
| **Token Revocation** | ❌ Must wait for JWT expiry |
| **Security** | ❌ Tokens exposed in JWT |
| **JWT Size** | ❌ Large (1-2KB+ with multiple tokens) |
| **Simplicity** | ✅ Easier to implement |
| **Best For** | MVP, prototyping, low-security scenarios |

## What mcp-auth Provides

### ✅ Implemented
- `JWTAuthProvider` - Validates JWT, extracts userId (and optionally caches embedded tokens)
- `APITokenResolver` - Calls tenant manager API for tokens ⭐ **RECOMMENDED**
- `JWTTokenResolver` - Returns tokens cached from JWT (for MVP/prototyping)
- `EnvAuthProvider` - Environment variables (for single-user/local dev)
- `SimpleTokenResolver` - Environment variables (for single-user/local dev)

### ❌ NOT Supported (By Design)
- Direct database access to tenant manager's DB
  * **Reason**: Violates separation of concerns
  * **Reason**: Creates tight coupling
  * **Reason**: Security risk (MCP server shouldn't have DB credentials)

## Production Architecture (Recommended)

```typescript
// MCP Server Instance
const wrapped = wrapServer({
  serverFactory: createInstagramServer,
  
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.SHARED_JWT_SECRET
  }),
  
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: 'https://tenant-manager.example.com',
    serviceToken: process.env.SERVICE_TOKEN,
    cacheTokens: true,
    cacheTtl: 300000 // 5 minutes
  }),
  
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});
```

**JWT Structure (Small):**
```json
{
  "userId": "user-123",
  "exp": 1234567890
}
```

**Tenant Manager API:**
```
GET /api/credentials/user-123/instagram
Authorization: Bearer <service-token>

Response:
{
  "accessToken": "IGQVJXabc...",
  "expiresAt": 1234567890
}
```

**Benefits:**
- ✅ Tenant manager can rotate tokens anytime
- ✅ Tokens can be revoked immediately
- ✅ Tokens never exposed in JWT
- ✅ Small JWT size
- ✅ Caching reduces API calls to near-zero

## Summary

**For Production: Use API-Based Resolution**
- Better security (tokens not in JWT)
- Automatic token refresh
- Immediate revocation
- Small JWT size

**For MVP/Prototyping: Use JWT-Embedded Tokens**
- Faster to implement
- Zero API calls
- Good for getting started

The MCP Server Instance remains **stateless and decoupled** from the tenant manager's database in both approaches.
