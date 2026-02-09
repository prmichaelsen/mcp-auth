# Ephemeral vs Cached Server Instances - Architecture Decision

## Context

When implementing multi-tenant MCP servers with mcp-auth, we must decide between:
1. **Ephemeral instances**: Create new server instance per request
2. **Cached instances**: Maintain pool of server instances, reuse by user ID

## Decision: Ephemeral Instances

We chose ephemeral server instances for multi-tenant MCP servers.

## Rationale

### Security (Primary Driver)

**Ephemeral**:
- ✅ Complete isolation between users
- ✅ Zero risk of token leakage
- ✅ No cross-user contamination possible
- ✅ Each request gets fresh, clean state

**Cached**:
- ❌ Risk of token leakage if cache key collision
- ❌ Potential for cross-user data exposure
- ❌ Complex invalidation logic required
- ❌ Stale token issues when users rotate tokens

### Performance Analysis

**Ephemeral Overhead**:
- Server object instantiation: ~0.1ms
- EventbriteClient creation: ~0.1ms
- 57 tool class instances: ~0.5ms
- Map creation and registration: ~0.3ms
- **Total**: ~1-2ms per request

**Context**:
- Network latency to Eventbrite API: 50-200ms
- Database query for token: 5-20ms
- JWT verification: 1-5ms
- **Ephemeral overhead**: <1% of total request time

**Caching Benefits**:
- Saves 1-2ms per request
- **Not worth the security risk and complexity**

### Memory Management

**Ephemeral**:
- ✅ Automatic garbage collection
- ✅ Bounded memory (only active requests)
- ✅ No memory leaks possible
- ✅ Scales with concurrent requests, not total users

**Cached**:
- ❌ Requires manual cache management
- ❌ Memory grows with user count
- ❌ Need TTL/LRU eviction logic
- ❌ Risk of memory leaks if not careful

### Complexity

**Ephemeral**:
- ✅ Simple: just call factory function
- ✅ No state management
- ✅ Easy to reason about
- ✅ Fewer bugs

**Cached**:
- ❌ Cache invalidation logic
- ❌ TTL management
- ❌ Eviction policies
- ❌ More surface area for bugs

### Token Rotation

**Ephemeral**:
- ✅ Always uses latest token from database
- ✅ No invalidation needed
- ✅ Handles token rotation automatically

**Cached**:
- ❌ Must invalidate cache when token rotates
- ❌ Risk of using stale tokens
- ❌ Complex invalidation triggers needed

### Horizontal Scaling

**Ephemeral**:
- ✅ Completely stateless
- ✅ Easy to scale across multiple servers
- ✅ No shared cache coordination needed

**Cached**:
- ❌ Need distributed cache (Redis)
- ❌ Cache invalidation across servers
- ❌ More infrastructure complexity

## Implementation

### Ephemeral Pattern (Chosen)

```typescript
// eventbrite-mcp/src/factory.ts
export function createServer(accessToken: string): Server {
  const client = new EventbriteClient({ apiToken: accessToken });
  const server = new Server({ name: 'eventbrite-mcp', version: '1.0.0' });
  
  // Register all tools with this client
  // ...
  
  return server;
}

// mcp-auth usage
const wrappedServer = wrapServer({
  serverFactory: (accessToken, userId) => createServer(accessToken),
  // mcp-auth handles per-request invocation
});
```

**Per Request Flow**:
1. Request arrives with JWT
2. mcp-auth extracts userId from JWT
3. mcp-auth fetches accessToken from database
4. mcp-auth calls `createServer(accessToken)` (~1-2ms)
5. Server executes tool (~50-200ms API call)
6. Server instance garbage collected
7. Total overhead: <1% of request time

### Cached Pattern (Not Chosen)

```typescript
// Would require in mcp-auth
const serverCache = new Map<string, { server: Server, lastUsed: number }>();

function getOrCreateServer(userId: string, accessToken: string): Server {
  if (serverCache.has(userId)) {
    const cached = serverCache.get(userId)!;
    cached.lastUsed = Date.now();
    return cached.server;
  }
  
  const server = createServer(accessToken);
  serverCache.set(userId, { server, lastUsed: Date.now() });
  
  // Need eviction logic
  evictStaleServers();
  
  return server;
}
```

**Issues**:
- Cache invalidation when token rotates
- Memory management complexity
- Security risk if cache key collision
- Distributed cache needed for multi-server
- Minimal performance benefit (1-2ms)

## Conclusion

**Ephemeral instances are the correct choice** because:
1. Security is paramount (no token leakage risk)
2. Performance overhead is negligible (<1% of request time)
3. Simplicity reduces bugs and maintenance burden
4. Automatic memory management
5. Stateless design enables easy horizontal scaling

The 1-2ms overhead is acceptable and far outweighed by the security and simplicity benefits.

## Future Considerations

If profiling shows the 1-2ms overhead is actually problematic (unlikely), mcp-auth could add **optional caching** as an opt-in feature with:
- Short TTL (30-60 seconds)
- Strict cache key validation
- Automatic invalidation on token rotation events
- Memory bounds enforcement

But start with ephemeral - optimize only if proven necessary.

## References

- [MCP Server Wrapping Pattern](/home/prmichaelsen/mcp-auth/agent/server-wrapping-pattern.md)
- [Multi-Tenant Architecture](/home/prmichaelsen/mcp-auth/agent/multi-tenant-architecture.md)
- Eventbrite MCP: [src/factory.ts](/home/prmichaelsen/eventbrite-mcp/src/factory.ts)
