# Tool Naming Convention - Double Prefix Bug

**Status**: Bug Identified
**Priority**: High
**Date**: 2026-02-11

## Problem

Tools are being registered with a **double prefix**:
- **Expected**: `instagram_get_profile`
- **Actual**: `instagram_instagram_get_profile`
- **Error**: `Unknown tool: get_profile`

## Debug Output

```json
{
  "toolCount": 12,
  "toolNames": [
    "instagram_instagram_get_profile",
    "instagram_instagram_get_media",
    ...
  ]
}
```

The `instagram_` prefix is being added **twice**.

## Root Cause

The prefix is being added in **two places**:

### Location 1: MCP Server Tool Registration
```typescript
// agentbase-mcp-server already adds prefix
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'instagram_get_profile', ... },  // ← First prefix
    { name: 'instagram_get_media', ... }
  ]
}));
```

### Location 2: Platform or Wrapper (Suspected)
```typescript
// Something is adding the prefix again
const toolName = `${provider}_${tool.name}`;
// If tool.name is already "instagram_get_profile"
// Result: "instagram_instagram_get_profile"  ← Double prefix!
```

## Where to Look

### Check 1: agentbase-mcp-server Tool Registration

Look for tool registration code and check if tools already have prefixes:

```typescript
// File: agentbase-mcp-server/src/server.ts or similar
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Are these already prefixed?
    { name: 'instagram_get_profile', ... },  // ← Check this
    // Or are they:
    { name: 'get_profile', ... }  // ← Or this?
  ]
}));
```

### Check 2: Platform Tool Name Transformation

Look for code that adds prefixes to tool names:

```typescript
// File: agentbase.me ChatRoom or MCP client
const tools = await mcpClient.listTools();

// Is there code like this?
const prefixedTools = tools.map(tool => ({
  ...tool,
  name: `${provider}_${tool.name}`  // ← This would cause double prefix!
}));
```

### Check 3: mcp-auth Wrapper

Check if mcp-auth is adding prefixes (it shouldn't be):

```typescript
// In mcp-auth, check if there's any code like:
const toolName = `${resourceType}_${originalName}`;
```

## Analysis

### Why Prefixes Exist

Tool prefixes serve important purposes:

1. **Namespace Collision Prevention**: When multiple MCP servers are connected (Instagram, GitHub, Slack), tools need unique names:
   ```
   instagram_get_profile  ✅ Unique
   github_get_profile     ✅ Unique
   slack_get_profile      ✅ Unique
   
   get_profile            ❌ Ambiguous - which service?
   ```

2. **Tool Discovery**: Clients can filter tools by prefix:
   ```typescript
   const instagramTools = allTools.filter(t => t.name.startsWith('instagram_'));
   const githubTools = allTools.filter(t => t.name.startsWith('github_'));
   ```

3. **Service Identification**: Tool name indicates which service it belongs to

### Two Deployment Scenarios

#### Scenario A: Single Service Environment
- Only Instagram MCP server connected
- No other services
- Prefixes are redundant (no collision possible)
- **Could use**: `get_profile`, `get_media`, etc.

#### Scenario B: Multi-Service Environment
- Multiple MCP servers (Instagram, GitHub, Slack, etc.)
- Tool name collisions possible
- Prefixes are necessary
- **Must use**: `instagram_get_profile`, `github_get_profile`, etc.

## Recommended Fix

### Option 1: Remove Prefix from MCP Server (Simplest) ✅

If tools are registered as `instagram_get_profile` in the MCP server, change them to just `get_profile`:

```typescript
// agentbase-mcp-server/src/server.ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'get_profile', ... },      // ← Remove instagram_ prefix
    { name: 'get_media', ... },
    { name: 'create_post', ... }
  ]
}));
```

Then the platform can add the prefix:
```typescript
// Platform adds prefix once
const toolName = `${provider}_${baseToolName}`;
// Result: "instagram_get_profile" ✅
```

### Option 2: Remove Prefix Addition in Platform

If the MCP server already registers tools with prefixes, don't add them again in the platform:

```typescript
// Platform - don't add prefix
await mcpClient.callTool(tool.name, args);  // Use name as-is
// If tool.name is "instagram_get_profile", use it directly
```

### Option 3: Check mcp-auth Wrapper

Verify mcp-auth isn't adding prefixes (it shouldn't be):

```typescript
// In mcp-auth src/wrapper/server-wrapper.ts
// Search for any code that modifies tool names
// There should be NO code like:
// tool.name = `${resourceType}_${tool.name}`;
```

## mcp-auth Perspective

From the mcp-auth framework perspective, **tool naming is the MCP server's responsibility**. The framework doesn't enforce or modify tool names - it simply forwards requests.

### What mcp-auth Does
- ✅ Authenticates requests
- ✅ Resolves tokens
- ✅ Creates server instances
- ✅ Forwards requests to server
- ❌ Does NOT modify tool names
- ❌ Does NOT enforce naming conventions

### Recommendation for mcp-auth Users

**Use prefixes by default** to support multi-service environments:
- `instagram_*` for Instagram tools
- `github_*` for GitHub tools
- `slack_*` for Slack tools

This is the standard MCP pattern and prevents issues when multiple services are integrated.

## Immediate Fix

For agentbase.me, the quickest fix is:

**Update platform tool calls to include prefix**:
```typescript
// In ChatRoom or wherever tools are called
const toolName = `${integration.provider}_${baseTool Name}`;
await mcpClient.callTool(toolName, args);

// Example:
await mcpClient.callTool('instagram_get_profile', { userId });
await mcpClient.callTool('github_get_repo', { repo });
```

## Long-Term Solution

Consider implementing **Option 3 (Configurable Prefix)** in agentbase-mcp-server to support both scenarios, with prefixes enabled by default.

## Testing

After fixing, verify:
```bash
# List tools
curl -X POST https://server/mcp/message \
  -H "Authorization: Bearer <JWT>" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Should return tools with prefixes:
# { "tools": [{ "name": "instagram_get_profile", ... }] }

# Call tool with prefix
curl -X POST https://server/mcp/message \
  -H "Authorization: Bearer <JWT>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"instagram_get_profile","arguments":{...}},"id":2}'
```

## Conclusion

**Recommendation**: Keep the `instagram_` prefix and update the platform to use prefixed tool names. This is the standard MCP pattern and ensures compatibility with multi-service environments.
