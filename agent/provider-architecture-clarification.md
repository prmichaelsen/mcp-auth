# Provider Architecture Clarification

## The Confusion

You're absolutely right to question this! Let me clarify what each provider does and where it lives.

## Two Deployment Scenarios

### Scenario 1: Tenant Manager Uses mcp-auth (Recommended)

The **tenant manager** (your platform) uses `@prmichaelsen/mcp-auth` to wrap MCP servers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Tenant Manager                            │
│  (Your platform - handles user auth & credentials)          │
│                                                              │
│  Uses @prmichaelsen/mcp-auth to wrap MCP servers:           │
│                                                              │
│  const wrapped = wrapServer({                                │
│    serverFactory: createInstagramServer,                     │
│    authProvider: new JWTAuthProvider({...}),  ← YOU implement│
│    tokenResolver: new DatabaseTokenResolver({...}), ← YOU   │
│    resourceType: 'instagram',                                │
│    transport: { type: 'sse', port: 3000 }                    │
│  });                                                         │
└─────────────────────────────────────────────────────────────┘
```

**In this scenario:**
- ✅ **YOU (tenant manager) implement** `JWTAuthProvider` and `DatabaseTokenResolver`
- ✅ These are **custom implementations** specific to your platform
- ✅ `@prmichaelsen/mcp-auth` provides the **interfaces** and **base classes**
- ✅ MCP servers (Instagram, GitHub) remain **completely unaware** of auth

### Scenario 2: MCP Server Has Embedded Auth (Alternative)

The **MCP server itself** uses `@prmichaelsen/mcp-auth` for embedded authentication:

```
┌─────────────────────────────────────────────────────────────┐
│              Instagram MCP Server Package                    │
│  (Uses @prmichaelsen/mcp-auth internally)                   │
│                                                              │
│  const server = new AuthenticatedMCPServer({                 │
│    authProvider: new JWTAuthProvider({...}),  ← PROVIDED    │
│    tokenResolver: new DatabaseTokenResolver({...}), ← BY    │
│    resourceType: 'instagram',                  ← mcp-auth   │
│    transport: { type: 'sse', port: 3000 }                    │
│  });                                                         │
└─────────────────────────────────────────────────────────────┘
```

**In this scenario:**
- ✅ `@prmichaelsen/mcp-auth` **provides reference implementations**
- ✅ MCP server authors can use them out-of-the-box
- ✅ Or customize them for their needs

## What Should mcp-auth Provide?

### Must Provide (Interfaces)
- ✅ `AuthProvider` interface
- ✅ `ResourceTokenResolver` interface
- ✅ `BaseAuthProvider` abstract class

### Should Provide (Reference Implementations)
These are **example/reference implementations** that users can:
- Use as-is for simple scenarios
- Extend for custom behavior
- Use as templates for their own implementations

#### JWTAuthProvider
```typescript
// Reference implementation in @prmichaelsen/mcp-auth
export class JWTAuthProvider extends BaseAuthProvider {
  constructor(config: { jwtSecret: string; database?: PoolConfig }) {
    // Validates JWT tokens
    // Optionally checks user exists in database
  }
  
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    const token = this.extractBearerToken(context);
    const decoded = jwt.verify(token, this.jwtSecret);
    return this.createSuccessResult(decoded.userId);
  }
}
```

**Usage in tenant manager:**
```typescript
// Option 1: Use reference implementation as-is
const authProvider = new JWTAuthProvider({
  jwtSecret: process.env.JWT_SECRET,
  database: { host: 'localhost', database: 'tenants' }
});

// Option 2: Extend for custom behavior
class MyJWTAuthProvider extends JWTAuthProvider {
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    const result = await super.doAuthenticate(context);
    // Add custom logic (e.g., check user permissions)
    return result;
  }
}

// Option 3: Implement from scratch
class CustomAuthProvider implements AuthProvider {
  async authenticate(context: RequestContext): Promise<AuthResult> {
    // Your custom logic
  }
}
```

#### DatabaseTokenResolver
```typescript
// Reference implementation in @prmichaelsen/mcp-auth
export class DatabaseTokenResolver implements ResourceTokenResolver {
  constructor(config: { 
    database: PoolConfig;
    tableName?: string; // Default: '{resourceType}_credentials'
    tokenColumn?: string; // Default: 'access_token'
  }) {
    // Queries database for user's resource token
  }
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    const tableName = this.config.tableName || `${resourceType}_credentials`;
    const result = await this.db.query(
      `SELECT ${this.config.tokenColumn} FROM ${tableName} WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.[this.config.tokenColumn] || null;
  }
}
```

**Usage in tenant manager:**
```typescript
// Option 1: Use reference implementation
const tokenResolver = new DatabaseTokenResolver({
  database: { host: 'localhost', database: 'tenants' }
});

// Option 2: Customize table/column names
const tokenResolver = new DatabaseTokenResolver({
  database: { host: 'localhost', database: 'tenants' },
  tableName: 'user_integrations',
  tokenColumn: 'api_token'
});

// Option 3: Implement custom logic
class MyTokenResolver implements ResourceTokenResolver {
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    // Your custom logic (e.g., decrypt tokens, check expiry, etc.)
  }
}
```

#### OAuthProvider
```typescript
// Reference implementation in @prmichaelsen/mcp-auth
export class OAuthProvider extends BaseAuthProvider {
  constructor(config: {
    introspectionUrl: string;
    clientId: string;
    clientSecret: string;
  }) {
    // Validates OAuth tokens by calling introspection endpoint
  }
  
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    const token = this.extractBearerToken(context);
    
    // Call OAuth introspection endpoint
    const response = await fetch(this.introspectionUrl, {
      method: 'POST',
      body: `token=${token}&client_id=${this.clientId}`
    });
    
    const data = await response.json();
    return this.createSuccessResult(data.sub || data.user_id);
  }
}
```

## Summary

### What mcp-auth Should Provide

| Component | Type | Purpose |
|-----------|------|---------|
| `AuthProvider` | Interface | Contract for authentication |
| `ResourceTokenResolver` | Interface | Contract for token resolution |
| `BaseAuthProvider` | Abstract Class | Common auth logic |
| `EnvAuthProvider` | Implementation | Simple env-based auth (✅ Done) |
| `SimpleTokenResolver` | Implementation | Simple env-based tokens (✅ Done) |
| `JWTAuthProvider` | Reference Implementation | JWT validation example |
| `DatabaseTokenResolver` | Reference Implementation | Database query example |
| `OAuthProvider` | Reference Implementation | OAuth introspection example |
| `APIKeyProvider` | Reference Implementation | API key lookup example |

### What Tenant Managers Do

Tenant managers can:
1. **Use reference implementations** as-is
2. **Extend reference implementations** for custom behavior
3. **Implement interfaces from scratch** for full control

## Recommendation

**Yes, implement the reference providers in Phase 8!**

They serve as:
- ✅ **Working examples** for tenant manager developers
- ✅ **Starting points** for customization
- ✅ **Best practices** demonstrations
- ✅ **Quick setup** for simple scenarios

But make it clear in documentation that these are **reference implementations** that can be customized or replaced entirely.
