# Debug: wrapServer SSE Endpoint Not Working

**Priority**: ~~HIGH~~ RESOLVED ✅
**Status**: ~~Investigating~~ **FIXED**
**Resolution Date**: 2026-02-11

## Problem (RESOLVED)

The server starts successfully but the `/mcp` endpoint returns 404.

### Observations

```bash
# Server logs show it's listening
[2026-02-09T20:16:18.307Z] INFO: SSE transport listening 
  {"host":"0.0.0.0","port":8080,"basePath":"/mcp","url":"http://0.0.0.0:8080/mcp"}

# But requests return 404
curl http://localhost:8080/mcp
→ Cannot GET /mcp (404)

curl -X POST http://localhost:8080/mcp
→ Cannot POST /mcp (404)
```

### Server is Running
- ✅ Docker container healthy
- ✅ Express server started
- ✅ Port 8080 listening
- ❌ `/mcp` route not registered

## Possible Causes

1. **wrapServer not setting up routes** - The function may not be creating the Express routes
2. **basePath configuration** - May need different configuration
3. **SSE transport issue** - Transport may not be initializing correctly
4. **mcp-auth version issue** - May need newer version

## Investigation Steps

### Step 1: Check mcp-auth Documentation

Review how `wrapServer` is supposed to be used:
```typescript
const wrapped = wrapServer({
  serverFactory,
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: { type: 'sse', port: 8080, basePath: '/mcp' }
});
```

### Step 2: Check mcp-auth Source

Look at how SSE transport is implemented in mcp-auth:
```bash
cd /home/prmichaelsen/mcp-auth
grep -r "basePath" src/
```

### Step 3: Try Alternative Configuration

```typescript
// Try without basePath
transport: { type: 'sse', port: 8080 }

// Or try different path
transport: { type: 'sse', port: 8080, basePath: '/' }
```

### Step 4: Check if wrapServer Returns Correctly

```typescript
console.log('Wrapped server:', wrappedServer);
console.log('Start function:', typeof wrappedServer.start);
```

## Workaround Options

### Option 1: Use Tool-Level Auth Instead

Instead of `wrapServer`, use `AuthenticatedMCPServer` directly:
```typescript
const server = new AuthenticatedMCPServer({
  name: 'agentbase-mcp-server',
  authProvider,
  tokenResolver,
  resourceType: 'instagram',
  transport: { type: 'sse', port: 8080 }
});

// Register tools manually
server.registerTool(/* ... */);
```

### Option 2: Check mcp-auth Examples

Look at mcp-auth examples to see correct usage.

## Next Steps

1. Review mcp-auth documentation/examples
2. Check if `wrapServer` is fully implemented
3. Try alternative configurations
4. Consider switching to tool-level auth pattern if needed

## Resolution

**Fixed on 2026-02-11**

### What Was Fixed
1. **Added root endpoint** - Added `GET /mcp` endpoint that returns server info
2. **Fixed StreamableHTTPServerTransport integration** - Properly integrated with MCP SDK's transport
3. **Removed placeholder code** - Eliminated all mock responses from server wrapper
4. **Validated in production** - Successfully deployed and tested with agentbase.me

### Current Implementation
The SSE transport now properly:
- Registers `GET /mcp` for server info
- Registers `POST /mcp/message` for MCP protocol messages
- Uses `StreamableHTTPServerTransport` for proper JSON-RPC 2.0 formatting
- Forwards tool names unchanged (transparent)
- Creates ephemeral server instances per request

### Production Validation
✅ JWT forwarding working
✅ Credentials API integration functional
✅ Tool discovery operational (12 tools)
✅ JSON-RPC 2.0 format correct
✅ MCP tools fully operational

## Impact

~~**Blocks**: Deployment and testing of agentbase-mcp-server~~
**RESOLVED**: Production deployment successful at agentbase.me
