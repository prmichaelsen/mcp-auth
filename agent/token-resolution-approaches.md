# Token Resolution Architecture

## Core Principle

**The MCP Server Instance does NOT access the Tenant Manager's database directly.**

All credential resolution happens through:
1. **JWT tokens** (embedded credentials)
2. **API calls** to tenant manager

## Supported Approaches

### Approach 1: JWT with Embedded Token (Recommended)

The tenant manager includes the resource token **inside the JWT**:

```
┌─────────────────────────────────────────────────────────────┐
│                  Tenant Manager                              │
│                                                              │
│  User logs in → Issues JWT:                                  │
│  {                                                           │
│    "userId": "user-123",                                     │
│    "instagramToken": "IGQVJXabc...",  ← Embedded            │
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
│     → Extracts: userId + instagramToken                      │
│                                                              │
│  2. TokenResolver returns cached token                       │
│     → No external calls needed                               │
│                                                              │
│  NO DATABASE OR API CALLS                                    │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
// JWT auth provider that caches tokens
class JWTWithTokenProvider extends BaseAuthProvider {
  public tokenCache = new Map<string, string>();
  
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    const token = this.extractBearerToken(context);
    const decoded = jwt.verify(token, this.jwtSecret) as {
      userId: string;
      instagramToken: string;
    };
    
    // Cache token for resolver
    this.tokenCache.set(decoded.userId, decoded.instagramToken);
    
    return this.createSuccessResult(decoded.userId);
  }
}

// Cached token resolver (no external calls)
class JWTTokenResolver implements ResourceTokenResolver {
  constructor(private authProvider: JWTWithTokenProvider) {}
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    return this.authProvider.tokenCache.get(userId) || null;
  }
}
```

**Pros:**
- ✅ Zero external dependencies
- ✅ Fastest (no network calls)
- ✅ Simplest deployment
- ✅ Completely stateless

**Cons:**
- ❌ Larger JWT size
- ❌ Token rotation requires new JWT
- ❌ Multiple resource tokens = very large JWT

### Approach 2: API-Based Resolution (Scalable)

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
// API-based token resolver
class APITokenResolver implements ResourceTokenResolver {
  constructor(private config: {
    tenantManagerUrl: string;
    serviceToken: string; // Auth for MCP server → tenant manager
  }) {}
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    const response = await fetch(
      `${this.config.tenantManagerUrl}/api/credentials/${userId}/${resourceType}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.serviceToken}`
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.accessToken;
  }
}
```

**Pros:**
- ✅ Small JWT size
- ✅ No direct database access
- ✅ Tenant manager controls access
- ✅ Can add caching/rate limiting
- ✅ Token rotation without new JWT

**Cons:**
- ❌ Extra HTTP call per request (~5-20ms)
- ❌ Network dependency

## What mcp-auth Provides

### ✅ Supported (Will Implement)
- `JWTAuthProvider` - Validates JWT, extracts userId (and optionally caches embedded tokens)
- `JWTTokenResolver` - Returns tokens cached from JWT
- `APITokenResolver` - Calls tenant manager API for tokens

### ❌ NOT Supported (By Design)
- `DatabaseTokenResolver` - Direct database access to tenant manager's DB
  * **Reason**: Violates separation of concerns
  * **Reason**: Creates tight coupling
  * **Reason**: Security risk (MCP server shouldn't have DB credentials)

## Recommended Architecture

```typescript
// MCP Server Instance configuration
const wrapped = wrapServer({
  serverFactory: createInstagramServer,
  
  // Validates JWT from tenant manager
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.SHARED_JWT_SECRET,
    extractToken: true // Extract embedded token from JWT
  }),
  
  // Returns token that was extracted from JWT
  tokenResolver: new JWTTokenResolver(),
  
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});
```

**JWT Structure:**
```json
{
  "userId": "user-123",
  "tokens": {
    "instagram": "IGQVJXabc...",
    "github": "ghp_abc123..."
  },
  "exp": 1234567890
}
```

## Summary

**mcp-auth supports:**
- ✅ JWT with embedded tokens (Approach 1) - **Recommended**
- ✅ API-based resolution (Approach 3) - **For scale**
- ❌ Direct database access (Approach 2) - **Not supported by design**

The MCP Server Instance remains **stateless and decoupled** from the tenant manager's database.
