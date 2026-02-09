# Provider Architecture Clarification

## Correct Architecture

The system has **three separate components** running on different machines:

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat Platform                             │
│              (Claude Desktop, Custom Client)                 │
│                                                              │
│  Sends requests with user's JWT token                        │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ MCP Protocol + JWT
                     │
┌────────────────────▼─────────────────────────────────────────┐
│              Tenant Manager Platform                         │
│              (Separate Machine/Service)                      │
│                                                              │
│  - User registration & OAuth login                           │
│  - Integration credential storage (DB)                       │
│  - Issues JWT tokens to users                                │
│  - Web portal for connecting integrations                    │
│  - Does NOT run MCP servers                                  │
│                                                              │
│  Database:                                                   │
│    - users table                                             │
│    - instagram_credentials table                             │
│    - github_credentials table                                │
└──────────────────────────────────────────────────────────────┘
                     
                     ↓ (JWT token + MCP request)
                     
┌──────────────────────────────────────────────────────────────┐
│            MCP Server Instance (Separate Machine)            │
│                                                              │
│  Uses @prmichaelsen/mcp-auth to wrap MCP servers:           │
│                                                              │
│  const wrapped = wrapServer({                                │
│    serverFactory: createInstagramServer,                     │
│    authProvider: new JWTAuthProvider({                       │
│      jwtSecret: SHARED_SECRET,                               │
│      // Validates JWT from tenant manager                    │
│    }),                                                       │
│    tokenResolver: new DatabaseTokenResolver({               │
│      database: TENANT_MANAGER_DB,                            │
│      // Queries tenant manager's database                    │
│    }),                                                       │
│    resourceType: 'instagram',                                │
│    transport: { type: 'sse', port: 3000 }                    │
│  });                                                         │
│                                                              │
│  Creates ephemeral Instagram MCP server per request         │
└──────────────────────────────────────────────────────────────┘
```

## The Three-Tier Architecture

### Tier 1: Chat Platform (Client)
- **Examples**: Claude Desktop, custom MCP clients
- **Responsibility**: Send MCP requests with user's JWT token
- **Location**: User's machine or cloud
- **Auth**: Holds JWT token from tenant manager

### Tier 2: Tenant Manager Platform
- **Responsibility**: User auth, credential storage, JWT issuance
- **Location**: Separate server/cloud service
- **Technology**: Any (your choice)
- **Does NOT**: Run MCP servers
- **Does**: Manage users and their integration credentials

**Database Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE instagram_credentials (
  user_id UUID REFERENCES users(id),
  access_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tier 3: MCP Server Instance
- **Responsibility**: Run MCP servers with authentication
- **Location**: Separate server/cloud service (different from tenant manager)
- **Technology**: Node.js + @prmichaelsen/mcp-auth
- **Does**: Instantiate ephemeral MCP servers per request
- **Connects to**: Tenant manager's database (read-only for credentials)

## Request Flow

```
1. User authenticates with Tenant Manager
   → Receives JWT token
   
2. User configures Chat Platform with JWT
   → Claude Desktop stores JWT
   
3. User makes request in Chat Platform
   → Chat Platform sends: MCP request + JWT token
   
4. Request arrives at MCP Server Instance
   ↓
5. mcp-auth validates JWT (JWTAuthProvider)
   → Extracts userId from JWT
   ↓
6. mcp-auth queries Tenant Manager DB (DatabaseTokenResolver)
   → SELECT instagram_token WHERE user_id = ?
   ↓
7. mcp-auth creates ephemeral Instagram server
   → createServer(instagram_token, userId)
   ↓
8. Ephemeral server executes tool
   → Instagram API call
   ↓
9. Response returned to Chat Platform
   ↓
10. Ephemeral server garbage collected
```

## What mcp-auth Provides

### For MCP Server Instance Operators

`@prmichaelsen/mcp-auth` provides **reference implementations** that the MCP server instance uses:

#### JWTAuthProvider (Reference Implementation)
```typescript
// Used by MCP Server Instance to validate JWTs from Tenant Manager
export class JWTAuthProvider extends BaseAuthProvider {
  constructor(config: { 
    jwtSecret: string; // Shared secret with tenant manager
  }) {}
  
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    const token = this.extractBearerToken(context);
    const decoded = jwt.verify(token, this.jwtSecret); // Validates JWT
    return this.createSuccessResult(decoded.userId);
  }
}
```

**Usage in MCP Server Instance:**
```typescript
// mcp-server-instance/server.ts
import { wrapServer, JWTAuthProvider, DatabaseTokenResolver } from '@prmichaelsen/mcp-auth';
import { createServer } from '@prmichaelsen/instagram-mcp';

const wrapped = wrapServer({
  serverFactory: createServer,
  
  // Validates JWT tokens issued by tenant manager
  authProvider: new JWTAuthProvider({
    jwtSecret: process.env.SHARED_JWT_SECRET // Same secret as tenant manager
  }),
  
  // Queries tenant manager's database for user's Instagram token
  tokenResolver: new DatabaseTokenResolver({
    database: {
      host: process.env.TENANT_DB_HOST,
      database: process.env.TENANT_DB_NAME,
      user: process.env.TENANT_DB_USER,
      password: process.env.TENANT_DB_PASSWORD
    }
  }),
  
  resourceType: 'instagram',
  transport: { type: 'sse', port: 3000 }
});

await wrapped.start();
```

#### DatabaseTokenResolver (Reference Implementation)
```typescript
// Used by MCP Server Instance to query Tenant Manager's database
export class DatabaseTokenResolver implements ResourceTokenResolver {
  constructor(config: { 
    database: PoolConfig; // Connection to tenant manager's DB
    tableName?: string;
    tokenColumn?: string;
  }) {}
  
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    // Queries tenant manager's database
    const result = await this.db.query(
      'SELECT access_token FROM instagram_credentials WHERE user_id = $1',
      [userId]
    );
    return result.rows[0]?.access_token || null;
  }
}
```

## Deployment

### Tenant Manager (Tier 2)
```yaml
# Deployed separately
service: tenant-manager
location: us-central1
database: tenant-manager-db
endpoints:
  - /auth/login (OAuth)
  - /auth/callback
  - /integrations/instagram/connect
  - /dashboard
```

### MCP Server Instance (Tier 3)
```yaml
# Deployed separately
service: mcp-server-instance
location: us-central1
connects_to: tenant-manager-db (read-only)
environment:
  - SHARED_JWT_SECRET (same as tenant manager)
  - TENANT_DB_HOST
  - TENANT_DB_NAME
endpoints:
  - /mcp/message (receives MCP requests)
```

## Summary

### What Each Component Does

| Component | Responsibility | Uses mcp-auth? |
|-----------|---------------|----------------|
| **Chat Platform** | Send MCP requests with JWT | No |
| **Tenant Manager** | User auth, credential storage, JWT issuance | No |
| **MCP Server Instance** | Run MCP servers with auth | **Yes** |

### What mcp-auth Provides

| Component | Type | Used By |
|-----------|------|---------|
| `AuthProvider` interface | Contract | MCP Server Instance |
| `ResourceTokenResolver` interface | Contract | MCP Server Instance |
| `JWTAuthProvider` | Reference Implementation | MCP Server Instance |
| `DatabaseTokenResolver` | Reference Implementation | MCP Server Instance |
| `OAuthProvider` | Reference Implementation | MCP Server Instance |
| `wrapServer()` | Core Function | MCP Server Instance |

The **MCP Server Instance** is the only component that uses `@prmichaelsen/mcp-auth`. It validates JWTs from the tenant manager and queries the tenant manager's database for credentials.
