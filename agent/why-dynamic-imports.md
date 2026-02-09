# Why Dynamic Imports for Express and CORS?

## The Problem

`@prmichaelsen/mcp-auth` supports **three transport types**:
1. **stdio** - No dependencies needed
2. **SSE** - Requires express + cors
3. **HTTP** - Requires express + cors

If we use static imports:
```typescript
import express from 'express';
import cors from 'cors';
```

**Problem**: Users who only use stdio mode would be **forced to install** express and cors, even though they don't need them!

## The Solution: Dynamic Imports

```typescript
// Only import when actually needed
private async startSSETransport(): Promise<void> {
  const express = await import('express');  // ← Loaded only if SSE is used
  const cors = await import('cors');        // ← Loaded only if CORS is enabled
  // ...
}
```

## Benefits

### 1. Optional Dependencies

**package.json:**
```json
{
  "name": "@prmichaelsen/mcp-auth",
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "optionalDependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5"
  }
}
```

**User experience:**
```bash
# User only needs stdio
npm install @prmichaelsen/mcp-auth
# ✅ Works! No express/cors needed

# User needs SSE
npm install @prmichaelsen/mcp-auth express cors
# ✅ Works! Express loaded dynamically
```

### 2. Smaller Bundle

Users who don't use SSE/HTTP don't pay the cost of bundling express:

```
stdio-only app:
  @prmichaelsen/mcp-auth: 50KB
  Total: 50KB

SSE app:
  @prmichaelsen/mcp-auth: 50KB
  express: 200KB
  cors: 10KB
  Total: 260KB
```

### 3. Tree Shaking

Build tools can eliminate unused code:

```typescript
// If user only uses stdio
import { wrapServer } from '@prmichaelsen/mcp-auth';

// Bundler sees:
// - startSSETransport() is never called
// - express import is never executed
// - Can be tree-shaken out
```

### 4. Runtime Flexibility

The library can detect if dependencies are available:

```typescript
private async startSSETransport(): Promise<void> {
  try {
    const express = await import('express');
    // Use express
  } catch (error) {
    throw new Error(
      'express is required for SSE transport. Install it with: npm install express'
    );
  }
}
```

## Alternative Approaches (Not Used)

### ❌ Static Imports
```typescript
import express from 'express';
import cors from 'cors';
```
**Problem**: Forces all users to install express/cors

### ❌ Separate Packages
```typescript
@prmichaelsen/mcp-auth-core
@prmichaelsen/mcp-auth-sse
@prmichaelsen/mcp-auth-http
```
**Problem**: Fragmentation, harder to use

### ✅ Dynamic Imports (Chosen)
```typescript
const express = await import('express');
```
**Benefits**: Optional deps, smaller bundles, better UX

## Summary

Dynamic imports make `@prmichaelsen/mcp-auth` a **zero-dependency library** for stdio users, while still supporting SSE/HTTP for those who need it.

This is a common pattern in Node.js libraries (e.g., `winston`, `pino`, `fastify`).
