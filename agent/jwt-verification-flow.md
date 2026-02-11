# JWT Token Verification Flow

## How MCP Server Verifies JWT Tokens

The MCP server verifies JWT tokens **locally** using a **shared secret**, not by calling an API endpoint.

## The Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Tenant Manager                              │
│                                                              │
│  1. User logs in                                             │
│  2. Issues JWT signed with SECRET_KEY:                       │
│                                                              │
│     jwt.sign(                                                │
│       { userId: "user-123" },                                │
│       SECRET_KEY  ← Shared secret                            │
│     )                                                        │
│                                                              │
│  Result: "eyJhbGciOiJIUzI1NiIs..."                           │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ JWT token
                     │
┌────────────────────▼─────────────────────────────────────────┐
│              MCP Server Instance                             │
│                                                              │
│  1. Receives request with JWT in Authorization header        │
│                                                              │
│  2. JWTAuthProvider verifies JWT LOCALLY:                    │
│                                                              │
│     jwt.verify(                                              │
│       token,                                                 │
│       SECRET_KEY  ← Same shared secret                       │
│     )                                                        │
│                                                              │
│     ✓ Signature valid → JWT is authentic                     │
│     ✓ Not expired → JWT is still valid                       │
│     ✓ Extracts userId: "user-123"                            │
│                                                              │
│  NO API CALL TO TENANT MANAGER FOR VERIFICATION              │
│                                                              │
│  3. APITokenResolver calls tenant manager API:               │
│     GET /api/credentials/user-123/instagram                  │
│     → Returns access token                                   │
└──────────────────────────────────────────────────────────────┘
```

## Key Points

### JWT Verification (Step 2)
- ✅ **Local verification** using shared secret
- ✅ **No API call** to tenant manager
- ✅ **Fast** (~1-5ms)
- ✅ **Stateless** - no database needed

### Token Resolution (Step 3)
- ✅ **API call** to tenant manager
- ✅ **Gets resource token** (Instagram, GitHub, etc.)
- ✅ **Allows token refresh** without new JWT

## Configuration

### Tenant Manager
```typescript
// Issues JWT
const token = jwt.sign(
  { userId: user.id },
  process.env.JWT_SECRET, // ← Secret key
  { expiresIn: '7d' }
);
```

### MCP Server Instance
```typescript
// Verifies JWT with same secret
const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET // ← Same secret key
});
```

**Important**: The JWT_SECRET must be **shared** between tenant manager and MCP server instance.

## Why This Works

### JWT is Self-Contained
- JWT contains all auth information
- Signature proves it was issued by tenant manager
- No need to call back to tenant manager for verification

### Cryptographic Verification
```
JWT = Header + Payload + Signature

Signature = HMAC-SHA256(
  base64(Header) + "." + base64(Payload),
  SECRET_KEY
)

Verification:
1. Recalculate signature using SECRET_KEY
2. Compare with signature in JWT
3. If match → JWT is authentic
```

## Security Considerations

### Shared Secret Management
- ✅ Use environment variables
- ✅ Rotate periodically
- ✅ Use strong secrets (min 32 characters)
- ✅ Never commit to git

### JWT Expiration
- ✅ Set reasonable expiry (e.g., 7 days)
- ✅ MCP server checks expiration during verification
- ✅ Expired JWTs are rejected

## Summary

**JWT Verification**: Local, using shared secret (no API call)
**Token Resolution**: API call to tenant manager (gets resource token)

Two separate steps:
1. **Verify JWT** → Who is this? (local, fast)
2. **Resolve token** → What's their Instagram token? (API call)

This design provides:
- ✅ Fast authentication (local JWT verification)
- ✅ Flexible token management (API-based resolution)
- ✅ Token refresh without new JWT
- ✅ Stateless MCP server
