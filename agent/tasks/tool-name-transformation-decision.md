# Should mcp-auth Handle Tool Name Prefixing/Stripping?

**Status**: Design Decision  
**Priority**: Medium  
**Date**: 2026-02-11

## Question

Should the mcp-auth framework automatically handle tool name prefixing/stripping based on the `resourceType` configuration?

## Current Behavior

mcp-auth is **transparent** - it doesn't modify tool names:
- MCP server registers: `instagram_get_profile`
- mcp-auth forwards: `instagram_get_profile` (unchanged)
- Client sees: `instagram_get_profile`

## Proposed Behavior

mcp-auth could **automatically add prefixes** based on `resourceType`:

```typescript
const wrapped = wrapServer({
  serverFactory: createServer,
  resourceType: 'instagram',  // ← Used as prefix
  // ...
});

// MCP server registers: 'get_profile'
// mcp-auth transforms to: 'instagram_get_profile'
// Client sees: 'instagram_get_profile'
```

## Analysis

### Option A: Automatic Prefixing (mcp-auth adds prefix)

**Implementation**:
```typescript
// In AuthenticatedServerWrapper
private transformToolName(toolName: string): string {
  // Add prefix if not already present
  const prefix = `${this.config.resourceType}_`;
  if (toolName.startsWith(prefix)) {
    return toolName; // Already has prefix
  }
  return `${prefix}${toolName}`;
}

// When forwarding tools/list response
const tools = response.tools.map(tool => ({
  ...tool,
  name: this.transformToolName(tool.name)
}));
```

**Pros**:
- ✅ MCP servers can use simple names (`get_profile`)
- ✅ Automatic namespace protection
- ✅ Consistent naming across all wrapped servers
- ✅ Platform doesn't need to know about prefixes

**Cons**:
- ❌ mcp-auth is no longer transparent
- ❌ Modifies tool names (side effect)
- ❌ Could break if server already uses prefixes
- ❌ Adds complexity to the framework

### Option B: Automatic Stripping (mcp-auth removes prefix)

**Implementation**:
```typescript
// In AuthenticatedServerWrapper
private stripToolPrefix(toolName: string): string {
  const prefix = `${this.config.resourceType}_`;
  if (toolName.startsWith(prefix)) {
    return toolName.substring(prefix.length);
  }
  return toolName;
}

// When forwarding tools/call request
const actualToolName = this.stripToolPrefix(requestedToolName);
```

**Pros**:
- ✅ Platform can use simple names (`get_profile`)
- ✅ MCP servers keep their prefixes
- ✅ Backward compatible with existing servers

**Cons**:
- ❌ mcp-auth is no longer transparent
- ❌ Modifies tool names (side effect)
- ❌ Loses namespace information
- ❌ Breaks multi-service scenarios

### Option C: Configurable Behavior (Best of Both)

**Implementation**:
```typescript
interface ServerWrapperConfig {
  // ... existing config
  
  /**
   * Tool name transformation strategy
   * - 'none': No transformation (default, transparent)
   * - 'add-prefix': Add resourceType as prefix
   * - 'strip-prefix': Remove resourceType prefix
   * - 'normalize': Ensure single prefix
   */
  toolNameStrategy?: 'none' | 'add-prefix' | 'strip-prefix' | 'normalize';
}

const wrapped = wrapServer({
  resourceType: 'instagram',
  toolNameStrategy: 'normalize',  // Ensures single prefix
  // ...
});
```

**Pros**:
- ✅ Flexible for different use cases
- ✅ Backward compatible (default: 'none')
- ✅ Can handle double prefix issues
- ✅ Explicit configuration

**Cons**:
- ❌ More complex API
- ❌ More code to maintain
- ❌ Users need to understand the options

### Option D: Keep Transparent (Current Behavior) ✅

**Rationale**: mcp-auth should be a **thin authentication layer**, not a tool name manager.

**Pros**:
- ✅ Simple, predictable behavior
- ✅ No side effects
- ✅ MCP servers control their own naming
- ✅ Framework stays focused on auth

**Cons**:
- ❌ Users must handle naming themselves
- ❌ No protection against double prefixes

## Recommendation

### For mcp-auth: Option D (Keep Transparent) ✅

**Rationale**:
1. **Single Responsibility**: mcp-auth should focus on authentication, not tool naming
2. **Predictability**: No magic transformations
3. **Simplicity**: Less code, fewer edge cases
4. **Flexibility**: MCP servers control their own naming conventions

### For MCP Server Authors: Document Best Practices

Add to mcp-auth documentation:

```markdown
## Tool Naming Best Practices

When creating MCP servers for use with mcp-auth:

1. **Use prefixes for multi-service environments**:
   - ✅ `instagram_get_profile`
   - ✅ `github_get_repo`
   - ❌ `get_profile` (ambiguous)

2. **Don't double-prefix**:
   - ✅ `instagram_get_profile`
   - ❌ `instagram_instagram_get_profile`

3. **Be consistent**:
   - All tools from the same server should use the same prefix
   - Use the resource type as the prefix (e.g., `instagram_`, `github_`)
```

### For Platform Developers: Provide Utilities

If platforms need prefix handling, provide utility functions:

```typescript
// In mcp-auth or platform code
export function normalizeToolName(toolName: string, resourceType: string): string {
  const prefix = `${resourceType}_`;
  
  // Remove duplicate prefixes
  while (toolName.startsWith(prefix + resourceType + '_')) {
    toolName = toolName.substring(prefix.length);
  }
  
  // Ensure single prefix
  if (!toolName.startsWith(prefix)) {
    toolName = prefix + toolName;
  }
  
  return toolName;
}

// Usage
const normalized = normalizeToolName('instagram_instagram_get_profile', 'instagram');
// Result: 'instagram_get_profile'
```

## Decision

**Keep mcp-auth transparent** (Option D). Tool naming is the MCP server's responsibility.

If prefix handling is needed, it should be:
1. **Documented** as a best practice
2. **Handled by MCP servers** (register with correct names)
3. **Or handled by platforms** (using utility functions)

But **not by mcp-auth** - the framework should remain focused on authentication and stay transparent to tool names.

## Alternative: Optional Feature

If there's strong demand, we could add **optional** prefix handling as a configuration option (Option C), but default to transparent behavior.

This keeps the framework simple while allowing advanced users to opt-in to prefix management if needed.
