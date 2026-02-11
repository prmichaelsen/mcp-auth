# Add Automatic Tool Prefix Stripping in wrapServer()

## Problem

When wrapping MCP servers with `wrapServer()`, the platform adds service-specific prefixes to tool names based on context (e.g., `instagram_get_profile`, `github_create_issue`). However, the underlying MCP servers define tools without these prefixes (e.g., `get_profile`, `create_issue`).

Currently, there's a mismatch:
- Platform calls: `instagram_get_profile` (with service prefix)
- MCP server has registered: `get_profile` (without prefix)
- Result: "Unknown tool" error

## Proposed Solution

Make `wrapServer()` automatically strip the `resourceType` prefix from incoming requests:

**When listing tools (`tools/list`):**
- Add `{resourceType}_` prefix to tool names before sending to platform
- MCP server has: `get_profile`
- Platform sees: `instagram_get_profile`

**When calling tools (`tools/call`):**
- Strip `{resourceType}_` prefix from tool name before forwarding to wrapped server
- Platform calls: `instagram_get_profile`
- MCP server receives: `get_profile`

## Benefits

1. **Clean separation**: MCP servers use simple tool names, platform adds service context
2. **No configuration needed**: Automatic based on `resourceType`
3. **Prevents conflicts**: Platform can namespace tools by service
4. **Better UX**: MCP servers have clean, reusable tool names

## Implementation

### Location
`/home/prmichaelsen/mcp-auth/src/wrapper/server-wrapper.ts`

### Changes Needed

#### 1. Add prefix in `tools/list` response

When forwarding the `ListToolsRequest` to the wrapped server, transform the response:

```typescript
// In handleRequest() method, when method is 'tools/list'
const response = await server.handleRequest(request);

// Add resourceType prefix to tool names for platform
if (response.tools) {
  const prefix = `${this.config.resourceType}_`;
  response.tools = response.tools.map(tool => ({
    ...tool,
    name: `${prefix}${tool.name}`
  }));
}

return response;
```

#### 2. Strip prefix in `tools/call` request

When forwarding the `CallToolRequest` to the wrapped server, transform the request:

```typescript
// In handleRequest() method, when method is 'tools/call'
const prefix = `${this.config.resourceType}_`;
const toolName = request.params.name;

// Strip prefix if present
const strippedName = toolName.startsWith(prefix)
  ? toolName.slice(prefix.length)
  : toolName;

const modifiedRequest = {
  ...request,
  params: {
    ...request.params,
    name: strippedName
  }
};

const response = await server.handleRequest(modifiedRequest);
return response;
```

### Edge Cases

1. **Tool name without prefix on call**: Pass through as-is
   - If platform calls `get_profile` but expects `instagram_get_profile`, strip will fail gracefully
   
2. **No resourceType**: Skip transformation
   - Only apply if `resourceType` is defined

3. **Empty prefix**: Handle edge case
   - If `resourceType` is empty string, don't add underscore

## Testing

### Test Case 1: Basic prefix adding (tools/list)
```typescript
// Given: Server has tool "get_profile"
// When: Platform calls tools/list
// Then: Returns tool named "instagram_get_profile"
```

### Test Case 2: Basic prefix stripping (tools/call)
```typescript
// Given: Platform calls "instagram_get_profile"
// When: Forwarding to server
// Then: Server receives "get_profile"
```

### Test Case 3: Tool without prefix in call
```typescript
// Given: Platform calls "get_profile" (missing prefix)
// When: Forwarding to server
// Then: Server receives "get_profile" (unchanged, will likely fail)
```

### Test Case 4: Multiple services
```typescript
// Given: Instagram server with "get_profile"
//        GitHub server with "get_profile"
// When: Both wrapped with different resourceTypes
// Then: Instagram exposes "instagram_get_profile"
//       GitHub exposes "github_get_profile"
```

## Migration

This is a **breaking change** if any existing code relies on prefixed tool names.

**Migration path:**
1. Release as mcp-auth@3.0.0 (major version bump)
2. Update documentation to explain automatic prefix handling
3. Provide example showing the transformation

## Documentation Updates

Update `/home/prmichaelsen/mcp-auth/README.md`:

```markdown
### Automatic Tool Prefix Handling

When using `wrapServer()` with a `resourceType`, tool names are automatically transformed:

- **MCP Server**: Defines tools without prefix (e.g., `get_profile`)
- **Platform**: Sees and calls tools with prefix (e.g., `instagram_get_profile`)
- **mcp-auth**: Handles the translation automatically

Example:
```typescript
wrapServer({
  serverFactory: createInstagramServer,
  resourceType: 'instagram',  // Prefix to add/strip
  // ...
});

// Server registers: get_profile
// Platform sees: instagram_get_profile
// Platform calls: instagram_get_profile
// Server receives: get_profile
```

This allows MCP servers to use clean, reusable tool names while providing
service-namespaced tool names to the platform.
```

## Related Issues

- Fixes tool name mismatch in agentbase-mcp-server
- Enables clean multi-service architecture
- Improves platform UX with simple tool names

## Priority

**HIGH** - Blocking current agentbase-mcp-server deployment

## Estimated Effort

2-3 hours:
- 1 hour: Implementation
- 1 hour: Testing
- 30 min: Documentation
- 30 min: Review and deployment
