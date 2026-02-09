# Why Two Steps: AuthProvider + TokenResolver?

## The Problem

When a request arrives at the MCP Server Instance, we need **two different pieces of information**:

1. **WHO is making the request?** (userId)
2. **What Instagram/GitHub/etc token should we use?** (accessToken)

These are **two separate concerns** that require **two separate lookups**.

## Visual Example

```
Request arrives: Authorization: Bearer eyJhbGc...

Step 1: AuthProvider - WHO is this?
  ↓
  Decode JWT → userId: "user-123"

Step 2: TokenResolver - What's their Instagram token?
  ↓
  Query DB: SELECT instagram_token WHERE user_id = "user-123"
  ↓
  accessToken: "IGQVJXabc..."

Step 3: Create MCP Server
  ↓
  createInstagramServer(accessToken: "IGQVJXabc...")
  ↓
  Instagram API calls use this token
```

## Why Not Combined?

### ❌ Bad: Combined Approach
```typescript
interface AuthProvider {
  authenticate(context): Promise<{
    userId: string;
    instagramToken: string;  // ← Hardcoded to Instagram!
  }>;
}
```

**Problems:**
- ❌ Not reusable (hardcoded to Instagram)
- ❌ Can't support multiple resources
- ❌ Tight coupling

### ✅ Good: Separated Approach
```typescript
interface AuthProvider {
  authenticate(context): Promise<{ userId: string }>;
}

interface ResourceTokenResolver {
  resolveToken(userId, resourceType): Promise<string>;
}
```

**Benefits:**
- ✅ Reusable across any resource (Instagram, GitHub, Slack)
- ✅ Separation of concerns
- ✅ Flexible and composable

## Real-World Flow

### Scenario: User Makes Instagram Request

```
1. Chat Platform sends request
   Headers: { Authorization: "Bearer eyJhbGc..." }
   ↓

2. MCP Server Instance receives request
   ↓

3. AuthProvider.authenticate(context)
   Input: { headers: { authorization: "Bearer eyJhbGc..." } }
   Process: 
     - Extract JWT: "eyJhbGc..."
     - Verify signature with shared secret
     - Decode payload: { userId: "user-123", exp: 1234567890 }
   Output: { authenticated: true, userId: "user-123" }
   ↓

4. TokenResolver.resolveToken("user-123", "instagram")
   Input: userId="user-123", resourceType="instagram"
   Process:
     - Connect to Tenant Manager's database
     - Query: SELECT access_token FROM instagram_credentials WHERE user_id = 'user-123'
     - Result: { access_token: "IGQVJXabc..." }
   Output: "IGQVJXabc..."
   ↓

5. Create ephemeral Instagram server
   createInstagramServer(accessToken: "IGQVJXabc...", userId: "user-123")
   ↓

6. Execute Instagram API call
   client.getProfile() → Uses "IGQVJXabc..." token
```

## Why This Design?

### 1. Resource Agnostic

Same `JWTAuthProvider` works for **any** resource:

```typescript
// Same auth provider for all resources
const authProvider = new JWTAuthProvider({ jwtSecret: SECRET });

// Different token resolvers per resource
const instagramWrapper = wrapServer({
  authProvider,  // ← Same
  tokenResolver: new DatabaseTokenResolver({ table: 'instagram_credentials' }),
  resourceType: 'instagram'
});

const githubWrapper = wrapServer({
  authProvider,  // ← Same
  tokenResolver: new DatabaseTokenResolver({ table: 'github_credentials' }),
  resourceType: 'github'
});
```

### 2. Flexible Token Storage

Token resolver can get tokens from anywhere:

```typescript
// Option 1: Database
class DatabaseTokenResolver {
  async resolveToken(userId, resourceType) {
    return db.query('SELECT token FROM credentials WHERE user_id = ?');
  }
}

// Option 2: External API
class APITokenResolver {
  async resolveToken(userId, resourceType) {
    return fetch(`https://tenant-manager.com/api/tokens/${userId}/${resourceType}`);
  }
}

// Option 3: Encrypted storage
class EncryptedTokenResolver {
  async resolveToken(userId, resourceType) {
    const encrypted = await db.query('SELECT encrypted_token WHERE user_id = ?');
    return decrypt(encrypted);
  }
}

// Option 4: Environment (single-user)
class SimpleTokenResolver {
  async resolveToken(userId, resourceType) {
    return process.env.INSTAGRAM_ACCESS_TOKEN;
  }
}
```

### 3. Independent Evolution

Auth and token resolution can evolve independently:

```typescript
// Change auth method without changing token storage
authProvider: new OAuthProvider({ ... })  // Changed from JWT
tokenResolver: new DatabaseTokenResolver({ ... })  // Unchanged

// Change token storage without changing auth
authProvider: new JWTAuthProvider({ ... })  // Unchanged
tokenResolver: new VaultTokenResolver({ ... })  // Changed from Database
```

## Summary

**AuthProvider**: Answers "WHO is this?" (validates JWT/OAuth/APIKey → userId)
**TokenResolver**: Answers "What's their Instagram token?" (userId + resourceType → accessToken)

Two steps = Flexibility + Reusability + Separation of Concerns
