# Fix SSE Transport - Routes Not Registered

**Priority**: HIGH  
**Status**: Blocking agentbase-mcp-server  
**Estimated Time**: 2-3 hours

## Problem

The SSE transport in `wrapServer` logs that it's listening, but Express routes are not actually registered, resulting in 404 errors.

### Symptoms

```bash
# Server logs show success
[INFO] SSE transport listening {"port":8080,"basePath":"/mcp","url":"http://0.0.0.0:8080/mcp"}

# But requests return 404
curl http://localhost:8080/mcp
→ Cannot GET /mcp (404)

curl -X POST http://localhost:8080/mcp  
→ Cannot POST /mcp (404)
```

### Expected Behavior

The SSE endpoint should:
1. Accept GET requests for SSE connections
2. Accept POST requests for MCP messages
3. Return proper SSE responses

## Root Cause

The SSE transport implementation in `src/transports/sse-transport.ts` or `src/wrapper/server-wrapper.ts` is not properly registering Express routes.

## Investigation Steps

### Step 1: Check SSE Transport Implementation

```bash
cd /home/prmichaelsen/mcp-auth
cat src/transports/sse-transport.ts
```

Look for:
- Express app creation
- Route registration (`app.get()`, `app.post()`)
- Server listening logic

### Step 2: Check Server Wrapper

```bash
cat src/wrapper/server-wrapper.ts
```

Look for:
- How transport is initialized
- How routes are set up
- Connection handling

### Step 3: Compare with Working Examples

Check if there are working SSE examples in:
- `examples/` directory
- Test files
- Documentation

## Expected Implementation

The SSE transport should look something like:

```typescript
// src/transports/sse-transport.ts

export class SSETransport {
  private app: Express;
  private server: Server;
  
  constructor(config: TransportConfig) {
    this.app = express();
    
    // Register SSE endpoint
    this.app.get(config.basePath || '/mcp', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Handle SSE connection
      // ...
    });
    
    // Register POST endpoint for messages
    this.app.post(config.basePath || '/mcp', async (req, res) => {
      // Handle MCP message
      // ...
    });
  }
  
  async start() {
    this.server = this.app.listen(this.config.port);
  }
}
```

## Testing

After fixing, test with:

```bash
# Start server
cd /home/prmichaelsen/agentbase-mcp-server
npm start

# Test SSE connection
curl -N http://localhost:8080/mcp \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer test-token"

# Test POST
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Acceptance Criteria

- ✅ GET /mcp returns SSE stream (not 404)
- ✅ POST /mcp accepts MCP messages (not 404)
- ✅ Authentication works
- ✅ MCP protocol messages handled correctly

## Impact

**Blocks**: 
- agentbase-mcp-server deployment
- All SSE-based MCP servers using mcp-auth

**Once Fixed**:
- agentbase-mcp-server can deploy to Cloud Run
- SSE transport fully functional

## Alternative Workaround

If SSE is complex, could implement stdio transport first:
```typescript
transport: { type: 'stdio' }
```

This would allow testing the auth flow while SSE is being fixed.
