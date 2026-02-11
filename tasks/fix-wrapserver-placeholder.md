# Fix wrapServer() Placeholder Response

**Priority**: CRITICAL  
**Status**: Identified  
**Location**: `/home/prmichaelsen/mcp-auth`  
**Estimated Time**: 30 minutes

## Problem

The `wrapServer()` function in mcp-auth has a placeholder response instead of forwarding requests to the actual MCP server.

## Bug Location

**File**: `/home/prmichaelsen/mcp-auth/src/wrapper/server-wrapper.ts`  
**Line**: 292-301

### Current (Broken) Code

```typescript
// TODO: Implement actual MCP request forwarding
// For now, this is a placeholder
const response = { success: true, userId, resourceType: this.config.resourceType };

requestLogger.info('Request handled successfully', {
  userId,
  resourceType: this.config.resourceType
});

return response;
```

### Required Fix

```typescript
// Forward request to MCP server instance
const response = await server.handleRequest(request);

requestLogger.info('Request handled successfully', {
  userId,
  resourceType: this.config.resourceType
});

return response;
```

## Impact

**Current Behavior**:
- ✅ Authentication works
- ✅ Token resolution works
- ✅ Server instance created
- ❌ Request never forwarded to server
- ❌ Returns placeholder: `{ success, userId, resourceType }`
- ❌ No JSON-RPC formatting
- ❌ No tools returned

**After Fix**:
- ✅ Request forwarded to MCP server
- ✅ MCP server processes request
- ✅ Returns proper JSON-RPC 2.0 format
- ✅ Tools returned correctly

## Testing

### Before Fix
```bash
curl -X POST https://agentbase-mcp-server-dit6gawkbq-uc.a.run.app/mcp/message \
  -H "Authorization: Bearer <JWT>" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Returns:
{
  "success": true,
  "userId": "...",
  "resourceType": "instagram"
}
```

### After Fix
```bash
# Same command should return:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

## Implementation Steps

1. Open `/home/prmichaelsen/mcp-auth/src/wrapper/server-wrapper.ts`
2. Find line 292-301 (the TODO comment)
3. Replace placeholder with `await server.handleRequest(request)`
4. Ensure proper error handling
5. Test with agentbase-mcp-server
6. Publish new mcp-auth version
7. Update agentbase-mcp-server dependency

## Related Issues

- [mcp-server-jsonrpc-format-error.md](/home/prmichaelsen/agentbase.me/agent/tasks/mcp-server-jsonrpc-format-error.md)
- agentbase-mcp-server is blocked by this bug
- Platform integration blocked by this bug

## Priority

**CRITICAL** - This blocks all MCP tool execution for agentbase-mcp-server and any other servers using `wrapServer()`.
