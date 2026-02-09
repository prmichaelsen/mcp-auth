# Fix mcp-auth Package - Missing TypeScript Declarations

**Priority**: HIGH  
**Status**: Blocking agentbase-mcp-server  
**Estimated Time**: 30 minutes

## Problem

The `@prmichaelsen/mcp-auth` package is missing TypeScript declaration files (.d.ts) in the published npm package.

### Error
```
Could not find a declaration file for module '@prmichaelsen/mcp-auth'.
'/home/prmichaelsen/agentbase-mcp-server/node_modules/@prmichaelsen/mcp-auth/dist/index.js' 
implicitly has an 'any' type.
```

### Root Cause
The package.json declares types exist:
```json
"types": "dist/index.d.ts"
```

But the .d.ts files are not being included in the npm package.

## Solution

### Step 1: Check Build Process

```bash
cd /home/prmichaelsen/mcp-auth
npm run build
ls -la dist/*.d.ts
```

Verify that .d.ts files are generated.

### Step 2: Check package.json Files Field

```json
{
  "files": [
    "dist",
    "dist/**/*.d.ts"  // ← Ensure this is included
  ]
}
```

### Step 3: Rebuild and Republish

```bash
npm run build
npm version patch
npm publish
```

### Step 4: Verify in Consumer

```bash
cd /home/prmichaelsen/agentbase-mcp-server
npm install @prmichaelsen/mcp-auth@latest
ls node_modules/@prmichaelsen/mcp-auth/dist/*.d.ts
```

## Acceptance Criteria

- ✅ .d.ts files exist in dist/ after build
- ✅ .d.ts files included in npm package
- ✅ TypeScript can import without errors
- ✅ All exports have type definitions

## Impact

**Blocks**: agentbase-mcp-server implementation

**Once Fixed**: agentbase-mcp-server can compile successfully
