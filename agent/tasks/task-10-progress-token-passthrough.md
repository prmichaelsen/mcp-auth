# Task 10: Implement Progress Token Pass-Through

**Milestone**: M5 - Progress Streaming - Wrapper Integration  
**Priority**: HIGH  
**Status**: Not Started  
**Estimated Time**: 2-3 hours  
**Dependencies**: None

---

## Objective

Enable mcp-auth wrapper to extract `progressToken` from client requests and pass it through to wrapped MCP servers, allowing servers to send progress notifications back to clients.

## Background

The MCP SDK supports progress notifications via the `progressToken` parameter in requests. When a client provides a progress token, the server can send incremental progress updates during long-running operations. The mcp-auth wrapper currently doesn't pass this token through, preventing progress streaming in multi-tenant deployments.

## Steps

### 1. Update Types for Progress Support

Add progress-related types to [`src/types.ts`](src/types.ts):

```typescript
/**
 * Progress notification parameters
 */
export interface ProgressNotification {
  progressToken: string | number;
  progress?: number;
  total?: number;
  message?: string;
}

/**
 * Request extra parameters (from MCP SDK)
 */
export interface RequestExtra {
  progressToken?: string | number;
  [key: string]: any;
}
```

### 2. Update SSE Transport Handler

Modify [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts) SSE transport to extract and pass progress token:

**Location**: `startSSETransport()` method, around line 486

```typescript
// In the /mcp/message POST handler
app.post(`${basePath}/message`, async (req: any, res: any) => {
  try {
    // Authenticate request
    const context: RequestContext = {
      headers: req.headers,
      method: req.method,
      path: req.path,
      body: req.body
    };
    
    const authResult = await this.config.authProvider.authenticate(context);
    
    if (!authResult.authenticated) {
      return res.status(401).json({
        error: 'Authentication failed',
        code: 'AUTHENTICATION_ERROR'
      });
    }
    
    const userId = authResult.userId!;
    
    // Get or create server instance
    const server = await this.getOrCreateServer(userId);
    
    // Extract progress token from request (if provided)
    const progressToken = req.body._meta?.progressToken;
    
    // Create transport with progress token support
    const transport = new StreamableHTTPServerTransport({
      endpoint: `${basePath}/message`,
      sessionId: userId,
      // Pass progress token to transport
      extra: progressToken ? { progressToken } : undefined
    });
    
    // Handle the request
    await server.connect(transport);
    
    // ... rest of handler
  } catch (error) {
    // ... error handling
  }
});
```

### 3. Update Server Factory Calls

Ensure progress context is available when creating server instances:

**Location**: `getOrCreateServer()` method

```typescript
private async getOrCreateServer(
  userId: string,
  extra?: RequestExtra
): Promise<Server> {
  // Ephemeral mode - create new instance
  if (this.config.instanceMode === 'ephemeral') {
    const accessToken = await this.resolveToken(userId);
    const server = await this.config.serverFactory(accessToken, userId);
    
    // Store extra context for progress forwarding
    if (extra?.progressToken) {
      this.storeProgressContext(userId, extra.progressToken);
    }
    
    return server;
  }
  
  // Pooled mode - reuse or create
  // ... existing pooling logic
}
```

### 4. Add Progress Context Storage

Add method to track active progress tokens per user:

```typescript
private progressContexts: Map<string, string | number> = new Map();

private storeProgressContext(userId: string, progressToken: string | number): void {
  this.progressContexts.set(userId, progressToken);
  this.logger.debug('Stored progress context', { userId, progressToken });
}

private getProgressContext(userId: string): string | number | undefined {
  return this.progressContexts.get(userId);
}

private clearProgressContext(userId: string): void {
  this.progressContexts.delete(userId);
  this.logger.debug('Cleared progress context', { userId });
}
```

## Verification

- [ ] Progress token extracted from client request
- [ ] Progress token passed to wrapped MCP server
- [ ] Progress context stored per user
- [ ] No errors when progress token not provided (backward compatible)
- [ ] Logging shows progress token handling

## Testing

```typescript
describe('Progress Token Pass-Through', () => {
  it('should extract progressToken from request', async () => {
    const request = {
      body: {
        _meta: { progressToken: 'test-123' }
      }
    };
    
    // Verify token extracted
    expect(extractProgressToken(request)).toBe('test-123');
  });
  
  it('should pass progressToken to wrapped server', async () => {
    const mockServer = jest.fn();
    const wrapper = new AuthenticatedServerWrapper({
      serverFactory: mockServer,
      // ... config
    });
    
    await wrapper.handleRequest({
      _meta: { progressToken: 'test-123' }
    });
    
    // Verify server factory called with progress context
    expect(mockServer).toHaveBeenCalled();
  });
  
  it('should work without progressToken (backward compatible)', async () => {
    const request = { body: {} };
    
    // Should not throw
    expect(() => extractProgressToken(request)).not.toThrow();
  });
});
```

## Documentation

Update [`README.md`](README.md) to document progress support:

```markdown
## Progress Streaming

mcp-auth supports MCP progress notifications, allowing wrapped servers to stream progress updates to clients:

```typescript
// Client sends request with progressToken
const result = await client.request({
  method: 'tools/call',
  params: {
    name: 'long_running_operation',
    arguments: { /* ... */ }
  }
}, {
  progressToken: 'operation-123',
  onprogress: (progress) => {
    console.log('Progress:', progress.message);
  }
});
```

The mcp-auth wrapper automatically passes the progress token to the wrapped MCP server, which can then send progress notifications back to the client.
```

## Files Modified

- [`src/types.ts`](src/types.ts) - Add progress types
- [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts) - Extract and pass progress token
- [`README.md`](README.md) - Document progress support

## Next Task

[Task 11: Implement Progress Notification Forwarding](task-11-progress-notification-forwarding.md)

---

**Created**: 2026-02-23  
**Status**: Not Started  
**Assignee**: TBD
