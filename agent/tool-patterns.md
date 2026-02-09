# Tool Registration Patterns for lib/mcp-auth

## Overview

This document explores different patterns for registering tools with authentication in the `lib/mcp-auth` framework, making it easy and intuitive to add authenticated tools.

## Design Goals

1. **Minimal boilerplate**: Tools shouldn't need to handle auth logic
2. **Type safety**: Full TypeScript support with proper inference
3. **Flexibility**: Support different tool patterns (class-based, function-based)
4. **Composability**: Easy to add middleware (rate limiting, logging, etc.)
5. **Clear semantics**: Code should be self-documenting

## Pattern Options

### Pattern 1: Decorator/Wrapper Function

**Concept**: Wrap tool handlers with authentication

```typescript
// Define a tool handler (no auth logic)
async function getProfile(args: GetProfileArgs, accessToken: string, userId: string) {
  const client = new InstagramClient(accessToken);
  return client.getProfile(args.userId);
}

// Register with authentication wrapper
server.registerTool(
  'instagram_get_profile',
  withAuth(getProfile)  // Automatically injects accessToken and userId
);
```

**Implementation:**

```typescript
// lib/mcp-auth/server/decorators.ts

export function withAuth<TArgs, TResult>(
  handler: (args: TArgs, accessToken: string, userId: string) => Promise<TResult>
): AuthenticatedToolHandler<TArgs, TResult> {
  return async (args: TArgs, context: RequestContext, authProvider: AuthProvider, tokenResolver: ResourceTokenResolver, resourceType: string) => {
    // 1. Authenticate
    const authResult = await authProvider.authenticate(context);
    if (!authResult.authenticated || !authResult.userId) {
      throw new AuthError(authResult.error || 'Authentication failed');
    }
    
    // 2. Resolve token
    const accessToken = await tokenResolver.resolveToken(authResult.userId, resourceType);
    if (!accessToken) {
      throw new TokenError(`No ${resourceType} token found for user`);
    }
    
    // 3. Call handler
    return handler(args, accessToken, authResult.userId);
  };
}
```

**Usage:**

```typescript
import { withAuth } from '../lib/mcp-auth/server/decorators.js';

// Simple function-based tool
const getProfile = withAuth(async (args, accessToken, userId) => {
  const client = new InstagramClient(accessToken);
  return client.getProfile(args.userId);
});

server.registerTool('instagram_get_profile', getProfile);
```

**Pros:**
- ✅ Minimal boilerplate
- ✅ Clear separation of concerns
- ✅ Easy to understand
- ✅ Works with any function

**Cons:**
- ❌ Less object-oriented
- ❌ Harder to share state between tools

---

### Pattern 2: Class-Based Tools with Mixin

**Concept**: Define tools as classes, add authentication via mixin

```typescript
// Define tool as class
class GetProfileTool {
  name = 'instagram_get_profile';
  
  async execute(args: GetProfileArgs, accessToken: string, userId: string) {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  }
}

// Register with authentication
server.registerTool(new AuthenticatedTool(new GetProfileTool()));
```

**Implementation:**

```typescript
// lib/mcp-auth/server/tool.ts

export interface Tool<TArgs = any, TResult = any> {
  name: string;
  description?: string;
  inputSchema?: object;
  execute(args: TArgs, accessToken: string, userId: string): Promise<TResult>;
}

export class AuthenticatedTool<TArgs = any, TResult = any> {
  constructor(
    private tool: Tool<TArgs, TResult>,
    private options?: {
      requiresAuth?: boolean;
      rateLimit?: RateLimitConfig;
    }
  ) {}
  
  get name() {
    return this.tool.name;
  }
  
  get description() {
    return this.tool.description;
  }
  
  get inputSchema() {
    return this.tool.inputSchema;
  }
  
  async execute(
    args: TArgs,
    context: RequestContext,
    authProvider: AuthProvider,
    tokenResolver: ResourceTokenResolver,
    resourceType: string
  ): Promise<TResult> {
    // 1. Authenticate
    const authResult = await authProvider.authenticate(context);
    if (!authResult.authenticated || !authResult.userId) {
      throw new AuthError(authResult.error || 'Authentication failed');
    }
    
    // 2. Resolve token
    const accessToken = await tokenResolver.resolveToken(authResult.userId, resourceType);
    if (!accessToken) {
      throw new TokenError(`No ${resourceType} token found for user`);
    }
    
    // 3. Call tool's execute method
    return this.tool.execute(args, accessToken, authResult.userId);
  }
}
```

**Usage:**

```typescript
import { Tool, AuthenticatedTool } from '../lib/mcp-auth/server/tool.js';

class GetProfileTool implements Tool {
  name = 'instagram_get_profile';
  description = 'Get Instagram profile information';
  
  inputSchema = {
    type: 'object',
    properties: {
      userId: { type: 'string' }
    }
  };
  
  async execute(args: { userId: string }, accessToken: string, userId: string) {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  }
}

// Register
server.registerTool(new AuthenticatedTool(new GetProfileTool()));
```

**Pros:**
- ✅ Object-oriented
- ✅ Easy to share state/dependencies
- ✅ Clear tool definition
- ✅ Can add metadata (description, schema)

**Cons:**
- ❌ More boilerplate
- ❌ Requires class definition

---

### Pattern 3: Builder Pattern

**Concept**: Fluent API for building authenticated tools

```typescript
server
  .tool('instagram_get_profile')
  .withAuth()
  .handle(async (args, accessToken, userId) => {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  });
```

**Implementation:**

```typescript
// lib/mcp-auth/server/builder.ts

export class ToolBuilder<TArgs = any> {
  private _name: string;
  private _description?: string;
  private _inputSchema?: object;
  private _requiresAuth = false;
  private _handler?: ToolHandler<TArgs>;
  
  constructor(name: string) {
    this._name = name;
  }
  
  description(desc: string): this {
    this._description = desc;
    return this;
  }
  
  schema(schema: object): this {
    this._inputSchema = schema;
    return this;
  }
  
  withAuth(): this {
    this._requiresAuth = true;
    return this;
  }
  
  handle(handler: (args: TArgs, accessToken: string, userId: string) => Promise<any>): AuthenticatedToolDefinition {
    this._handler = handler;
    return {
      name: this._name,
      description: this._description,
      inputSchema: this._inputSchema,
      requiresAuth: this._requiresAuth,
      handler: this._handler
    };
  }
}

// In AuthenticatedMCPServer
export class AuthenticatedMCPServer {
  tool(name: string): ToolBuilder {
    return new ToolBuilder(name);
  }
  
  registerTool(definition: AuthenticatedToolDefinition) {
    // Register with MCP server
  }
}
```

**Usage:**

```typescript
server
  .tool('instagram_get_profile')
  .description('Get Instagram profile information')
  .schema({
    type: 'object',
    properties: {
      userId: { type: 'string' }
    }
  })
  .withAuth()
  .handle(async (args, accessToken, userId) => {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  });
```

**Pros:**
- ✅ Fluent, readable API
- ✅ Self-documenting
- ✅ Easy to add options
- ✅ Type-safe with generics

**Cons:**
- ❌ More complex implementation
- ❌ Less familiar pattern

---

### Pattern 4: Annotation/Metadata Pattern

**Concept**: Use TypeScript decorators (experimental) or metadata

```typescript
@Tool('instagram_get_profile')
@RequiresAuth('instagram')
class GetProfileTool {
  async execute(
    @Args() args: GetProfileArgs,
    @AccessToken() accessToken: string,
    @UserId() userId: string
  ) {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  }
}

server.registerTools([GetProfileTool]);
```

**Pros:**
- ✅ Very clean, declarative
- ✅ Familiar to NestJS/Angular developers

**Cons:**
- ❌ Requires experimental decorators
- ❌ More complex setup
- ❌ Not standard TypeScript

---

## Recommended Pattern: Hybrid Approach

Combine **Pattern 1 (Decorator)** and **Pattern 2 (Class-based)** for maximum flexibility:

```typescript
// lib/mcp-auth/index.ts
export { withAuth } from './server/decorators.js';
export { Tool, AuthenticatedTool } from './server/tool.js';
export { AuthenticatedMCPServer } from './server/mcp-server.js';
```

### Usage Example 1: Simple Function (Pattern 1)

```typescript
import { withAuth } from '../lib/mcp-auth/index.js';

// Quick and simple
const getProfile = withAuth(async (args, accessToken, userId) => {
  const client = new InstagramClient(accessToken);
  return client.getProfile(args.userId);
});

server.registerTool('instagram_get_profile', getProfile);
```

### Usage Example 2: Class-Based (Pattern 2)

```typescript
import { Tool, AuthenticatedTool } from '../lib/mcp-auth/index.js';

// More structured, reusable
class InstagramTools {
  constructor(private config: InstagramConfig) {}
  
  getProfile(): Tool {
    return {
      name: 'instagram_get_profile',
      description: 'Get Instagram profile',
      async execute(args, accessToken, userId) {
        const client = new InstagramClient(accessToken);
        return client.getProfile(args.userId);
      }
    };
  }
  
  getMedia(): Tool {
    return {
      name: 'instagram_get_media',
      description: 'Get Instagram media',
      async execute(args, accessToken, userId) {
        const client = new InstagramClient(accessToken);
        return client.getMedia(args);
      }
    };
  }
}

// Register all tools
const tools = new InstagramTools(config);
server.registerTool(new AuthenticatedTool(tools.getProfile()));
server.registerTool(new AuthenticatedTool(tools.getMedia()));
```

### Usage Example 3: Batch Registration

```typescript
import { Tool, AuthenticatedTool } from '../lib/mcp-auth/index.js';

// Define all tools
const tools: Tool[] = [
  {
    name: 'instagram_get_profile',
    async execute(args, accessToken, userId) {
      const client = new InstagramClient(accessToken);
      return client.getProfile(args.userId);
    }
  },
  {
    name: 'instagram_get_media',
    async execute(args, accessToken, userId) {
      const client = new InstagramClient(accessToken);
      return client.getMedia(args);
    }
  }
];

// Register all at once
server.registerTools(tools.map(t => new AuthenticatedTool(t)));
```

## Advanced: Middleware Composition

Allow tools to have multiple middleware layers:

```typescript
import { withAuth, withRateLimit, withLogging } from '../lib/mcp-auth/index.js';

const getProfile = compose(
  withLogging(),
  withRateLimit({ maxRequests: 10, windowMs: 60000 }),
  withAuth(),
  async (args, accessToken, userId) => {
    const client = new InstagramClient(accessToken);
    return client.getProfile(args.userId);
  }
);

server.registerTool('instagram_get_profile', getProfile);
```

**Implementation:**

```typescript
// lib/mcp-auth/server/compose.ts

type Middleware = (handler: Function) => Function;

export function compose(...middlewares: Middleware[]) {
  return (handler: Function) => {
    return middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler
    );
  };
}

export function withLogging(): Middleware {
  return (handler) => async (...args: any[]) => {
    console.log('Tool called:', args);
    const result = await handler(...args);
    console.log('Tool result:', result);
    return result;
  };
}

export function withRateLimit(config: RateLimitConfig): Middleware {
  const limiter = new RateLimiter(config);
  return (handler) => async (...args: any[]) => {
    await limiter.check(args[2]); // userId
    return handler(...args);
  };
}
```

## Summary

**Recommended Approach:**

1. **Export both patterns** from `lib/mcp-auth`:
   - `withAuth()` for simple, functional tools
   - `AuthenticatedTool` class for structured, OOP tools

2. **Provide middleware composition** for advanced use cases

3. **Keep it simple** - most users will use `withAuth()`

**Example API:**

```typescript
// Simple
server.registerTool('tool1', withAuth(handler));

// Class-based
server.registerTool(new AuthenticatedTool(new MyTool()));

// With middleware
server.registerTool('tool2', compose(
  withLogging(),
  withRateLimit({ maxRequests: 10 }),
  withAuth(),
  handler
));

// Batch
server.registerTools([
  new AuthenticatedTool(tool1),
  new AuthenticatedTool(tool2)
]);
```

This provides flexibility while keeping the common case (simple function with auth) very easy.
