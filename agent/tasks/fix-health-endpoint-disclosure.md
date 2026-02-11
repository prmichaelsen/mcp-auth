# Security Enhancement: Reduce Health Endpoint Information Disclosure

**Priority**: ⚠️ MEDIUM  
**Status**: Open  
**Created**: 2026-02-11  
**Source**: Security Audit #001  
**Risk Level**: MEDIUM

## Problem

The health endpoint exposes internal server information that could aid attackers in reconnaissance:
- Server name and version
- Resource type (e.g., "instagram")
- Instance mode (ephemeral/pooled)
- Pool size (number of active instances)

## Vulnerable Code

**File**: `src/wrapper/server-wrapper.ts:531`

```typescript
// Current: Exposes too much information
app.get(`${basePath}/health`, (req: any, res: any) => {
  res.json({
    status: 'healthy',
    name: this.config.name,              // ⚠️ Internal name
    version: this.config.version,        // ⚠️ Version info
    resourceType: this.config.resourceType,  // ⚠️ Resource type
    instanceMode: this.config.instanceMode,  // ⚠️ Architecture details
    poolSize: this.serverPool.size       // ⚠️ Pool size
  });
});
```

## Security Impact

- **Confidentiality**: LOW - Reveals architecture details
- **Information Disclosure**: Aids in targeted attacks

## Solution

### Minimal Health Endpoint

```typescript
// Public health endpoint (no authentication required)
app.get(`${basePath}/health`, (req: any, res: any) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Private metrics endpoint (requires authentication)
app.get(`${basePath}/metrics`, async (req: any, res: any) => {
  try {
    const context: RequestContext = {
      headers: req.headers,
      transport: 'sse',
      timestamp: new Date()
    };
    
    const authResult = await this.config.authProvider.authenticate(context);
    
    if (!authResult.authenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    res.json({
      name: this.config.name,
      version: this.config.version,
      resourceType: this.config.resourceType,
      instanceMode: this.config.instanceMode,
      poolSize: this.serverPool.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## Timeline

- **Target**: v5.0.0
- **Effort**: 2 hours
- **Priority**: Medium

## Acceptance Criteria

- [ ] Health endpoint returns minimal information
- [ ] Metrics endpoint added with authentication
- [ ] Tests added
- [ ] Documentation updated
