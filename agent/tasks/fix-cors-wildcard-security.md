# Security Fix: Remove CORS Wildcard Default

**Priority**: 🔴 CRITICAL  
**Status**: Open  
**Created**: 2026-02-11  
**Source**: Security Audit #001  
**Risk Level**: HIGH

## Problem

The CORS configuration defaults to wildcard (`origin: '*'`), which allows **any website** to make requests to the MCP server. This creates a significant security vulnerability enabling CSRF attacks.

## Vulnerable Code

**File**: `src/wrapper/server-wrapper.ts:480`

```typescript
// Current (INSECURE)
if (this.config.transport.cors) {
  const cors = await import('cors');
  app.use(cors.default({
    origin: this.config.transport.corsOrigin || '*'  // ⚠️ DANGEROUS DEFAULT
  }));
}
```

## Attack Scenario

1. Attacker hosts malicious site at `evil.com`
2. User visits `evil.com` while authenticated to MCP server
3. Malicious JavaScript makes requests to MCP server
4. Server accepts requests due to `origin: '*'`
5. Attacker gains access to user's MCP tools and data

## Security Impact

- **Confidentiality**: HIGH - Attacker can read user data
- **Integrity**: HIGH - Attacker can execute tools on behalf of user
- **Availability**: MEDIUM - Attacker can exhaust resources

**CVSS Score**: 8.1 (High)

## Solution

### Option 1: Require Explicit Configuration (RECOMMENDED)

```typescript
// Secure implementation
if (this.config.transport.cors) {
  if (!this.config.transport.corsOrigin || this.config.transport.corsOrigin === '*') {
    throw new ConfigurationError(
      'CORS origin must be explicitly configured. Wildcard (*) not allowed in production.'
    );
  }
  
  const cors = await import('cors');
  app.use(cors.default({
    origin: this.config.transport.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
  }));
}
```

### Option 2: Disable CORS by Default

```typescript
// CORS disabled unless explicitly enabled with valid origin
if (this.config.transport.cors) {
  if (!this.config.transport.corsOrigin) {
    throw new ConfigurationError('corsOrigin required when CORS is enabled');
  }
  
  if (this.config.transport.corsOrigin === '*') {
    this.logger.warn('CORS wildcard (*) is insecure and not recommended');
    
    if (process.env.NODE_ENV === 'production') {
      throw new ConfigurationError('CORS wildcard not allowed in production');
    }
  }
  
  // ... rest of CORS setup
}
```

## Implementation Steps

1. Update `src/wrapper/server-wrapper.ts` with secure CORS configuration
2. Update `src/types.ts` to document CORS security requirements
3. Add validation in `src/utils/validation.ts` for CORS origins
4. Update examples to show secure CORS configuration
5. Add security warning to README.md
6. Update INTEGRATION.md with CORS best practices

## Testing

```typescript
// Test cases needed
describe('CORS Security', () => {
  it('should reject wildcard origin in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => wrapServer({
      transport: { type: 'sse', cors: true, corsOrigin: '*' }
    })).toThrow('CORS wildcard not allowed');
  });
  
  it('should require explicit origin when CORS enabled', () => {
    expect(() => wrapServer({
      transport: { type: 'sse', cors: true }
    })).toThrow('corsOrigin required');
  });
  
  it('should accept specific origins', () => {
    expect(() => wrapServer({
      transport: { type: 'sse', cors: true, corsOrigin: 'https://app.example.com' }
    })).not.toThrow();
  });
});
```

## Documentation Updates

### README.md

Add security warning:

```markdown
## ⚠️ Security: CORS Configuration

When enabling CORS, **never use wildcard (`*`)** in production:

```typescript
// ❌ INSECURE - Allows any website to access your server
transport: { type: 'sse', cors: true, corsOrigin: '*' }

// ✅ SECURE - Only allow specific origins
transport: { 
  type: 'sse', 
  cors: true, 
  corsOrigin: 'https://your-app.example.com'
}

// ✅ SECURE - Multiple specific origins
transport: { 
  type: 'sse', 
  cors: true, 
  corsOrigin: ['https://app1.example.com', 'https://app2.example.com']
}
```
```

## Timeline

- **Target**: Immediate (before next production deployment)
- **Estimated Effort**: 2-3 hours
- **Breaking Change**: Yes (requires explicit CORS configuration)
- **Version Bump**: 5.0.0 (major)

## References

- Security Audit #001: `agent/security/audit_001.md`
- OWASP CORS Security: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing
- MDN CORS: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

## Related Issues

- None (new issue from security audit)

## Acceptance Criteria

- [ ] Wildcard CORS rejected in production
- [ ] Explicit origin required when CORS enabled
- [ ] Tests added for CORS validation
- [ ] Documentation updated with security warnings
- [ ] Examples updated with secure configuration
- [ ] Breaking change documented in CHANGELOG
