# Security Fix: Add HTTPS Enforcement

**Priority**: ⚠️ HIGH  
**Status**: Open  
**Created**: 2026-02-11  
**Source**: Security Audit #001  
**Risk Level**: MEDIUM-HIGH

## Problem

The framework does not enforce HTTPS for production deployments, allowing potential man-in-the-middle (MITM) attacks where JWT tokens and access tokens could be intercepted.

## Vulnerable Areas

### 1. Tenant Manager API URLs

**File**: `src/auth/providers/api-token-resolver.ts:316`

```typescript
// Current: No HTTPS validation
try {
  new URL(this.config.tenantManagerUrl);
} catch {
  throw new Error(`Invalid tenantManagerUrl: ${this.config.tenantManagerUrl}`);
}
```

### 2. SSE Transport

**File**: `src/wrapper/server-wrapper.ts:552`

```typescript
// Current: Logs HTTP URL without warning
this.logger.info('SSE transport listening', {
  url: `http://${host}:${port}${basePath}`  // Could be HTTP!
});
```

## Security Impact

- **Confidentiality**: HIGH - JWT tokens transmitted in clear text
- **Integrity**: HIGH - Requests can be modified in transit
- **Availability**: LOW - No direct availability impact

**CVSS Score**: 7.4 (High)

## Solution

### 1. Add HTTPS Validation for API URLs

```typescript
// src/auth/providers/api-token-resolver.ts
async initialize(): Promise<void> {
  // Validate URL format
  let url: URL;
  try {
    url = new URL(this.config.tenantManagerUrl);
  } catch {
    throw new Error(`Invalid tenantManagerUrl: ${this.config.tenantManagerUrl}`);
  }
  
  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new ConfigurationError(
      `HTTPS required for tenantManagerUrl in production. Got: ${url.protocol}//`
    );
  }
  
  // Warn for HTTP in development
  if (url.protocol !== 'https:') {
    this.logger.warn('Using HTTP for tenant manager API (insecure)', {
      url: this.config.tenantManagerUrl,
      recommendation: 'Use HTTPS in production'
    });
  }
  
  this.logger.info('APITokenResolver initialized', {
    tenantManagerUrl: this.config.tenantManagerUrl,
    secure: url.protocol === 'https:',
    cacheEnabled: this.config.cacheTokens
  });
}
```

### 2. Add TLS Configuration Options

```typescript
// src/types.ts
export interface TransportConfig {
  type: TransportType;
  port?: number;
  host?: string;
  basePath?: string;
  cors?: boolean;
  corsOrigin?: string | string[];
  
  /**
   * TLS/HTTPS configuration
   */
  tls?: {
    /**
     * Enforce HTTPS in production
     * @default true
     */
    enforceHttps?: boolean;
    
    /**
     * Minimum TLS version
     * @default 'TLSv1.2'
     */
    minVersion?: 'TLSv1.2' | 'TLSv1.3';
    
    /**
     * Certificate validation
     * @default true
     */
    rejectUnauthorized?: boolean;
  };
}
```

### 3. Add HTTPS Server Support

```typescript
// src/wrapper/server-wrapper.ts
private async startSSETransport(): Promise<void> {
  const express = await import('express');
  const app = express.default();
  
  // ... middleware setup
  
  const port = this.config.transport.port || 3000;
  const host = this.config.transport.host || '0.0.0.0';
  
  // Check if TLS is configured
  if (this.config.transport.tls) {
    const https = await import('https');
    const fs = await import('fs');
    
    const httpsOptions = {
      key: fs.readFileSync(process.env.TLS_KEY_PATH!),
      cert: fs.readFileSync(process.env.TLS_CERT_PATH!),
      minVersion: this.config.transport.tls.minVersion || 'TLSv1.2'
    };
    
    await new Promise<void>((resolve) => {
      https.createServer(httpsOptions, app).listen(port, host, () => {
        this.logger.info('SSE transport listening (HTTPS)', {
          host, port, basePath,
          url: `https://${host}:${port}${basePath}`
        });
        resolve();
      });
    });
  } else {
    // HTTP mode
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn('Running HTTP in production (insecure)', {
        recommendation: 'Use HTTPS or run behind reverse proxy with TLS termination'
      });
    }
    
    await new Promise<void>((resolve) => {
      app.listen(port, host, () => {
        this.logger.info('SSE transport listening (HTTP)', {
          host, port, basePath,
          url: `http://${host}:${port}${basePath}`,
          warning: 'HTTP is insecure - use HTTPS in production'
        });
        resolve();
      });
    });
  }
}
```

## Implementation Steps

1. Add TLS configuration to `TransportConfig` type
2. Add HTTPS validation to `APITokenResolver.initialize()`
3. Add HTTPS server support to `AuthenticatedServerWrapper`
4. Add validation utility for HTTPS URLs
5. Update documentation with TLS requirements
6. Add examples with HTTPS configuration
7. Add tests for HTTPS enforcement

## Testing

```typescript
describe('HTTPS Enforcement', () => {
  it('should reject HTTP tenant manager URL in production', async () => {
    process.env.NODE_ENV = 'production';
    const resolver = new APITokenResolver({
      tenantManagerUrl: 'http://tenant-manager.com',
      serviceToken: 'token'
    });
    
    await expect(resolver.initialize()).rejects.toThrow('HTTPS required');
  });
  
  it('should accept HTTPS URLs', async () => {
    const resolver = new APITokenResolver({
      tenantManagerUrl: 'https://tenant-manager.com',
      serviceToken: 'token'
    });
    
    await expect(resolver.initialize()).resolves.not.toThrow();
  });
  
  it('should warn for HTTP in development', async () => {
    process.env.NODE_ENV = 'development';
    const resolver = new APITokenResolver({
      tenantManagerUrl: 'http://localhost:3000',
      serviceToken: 'token'
    });
    
    // Should not throw, but should log warning
    await expect(resolver.initialize()).resolves.not.toThrow();
  });
});
```

## Documentation Updates

### README.md

Add TLS section:

```markdown
## 🔒 Security: TLS/HTTPS Configuration

### Production Deployment

**Always use HTTPS in production:**

```typescript
// ✅ HTTPS enforced
const wrapped = wrapServer({
  transport: {
    type: 'sse',
    port: 443,
    tls: {
      enforceHttps: true,
      minVersion: 'TLSv1.2'
    }
  },
  // ...
});
```

### Development

For local development, HTTP is allowed but will log warnings:

```typescript
// ⚠️ HTTP allowed in development only
const wrapped = wrapServer({
  transport: {
    type: 'sse',
    port: 3000
    // No TLS config - HTTP mode
  },
  // ...
});
```

### Reverse Proxy Setup

If running behind nginx/Caddy with TLS termination:

```typescript
// HTTP mode with reverse proxy
const wrapped = wrapServer({
  transport: {
    type: 'sse',
    port: 3000,
    host: '127.0.0.1'  // Only accept local connections
  },
  // ...
});
```
```

## Timeline

- **Target**: v5.0.0 release
- **Estimated Effort**: 3-4 hours
- **Breaking Change**: Potentially (if strict enforcement)
- **Dependencies**: None

## References

- Security Audit #001: `agent/security/audit_001.md`
- OWASP Transport Layer Protection: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html
- Node.js HTTPS: https://nodejs.org/api/https.html

## Acceptance Criteria

- [ ] HTTPS validation added to APITokenResolver
- [ ] HTTPS server support added to AuthenticatedServerWrapper
- [ ] Production mode enforces HTTPS
- [ ] Development mode logs warnings for HTTP
- [ ] TLS configuration options added
- [ ] Tests added for HTTPS enforcement
- [ ] Documentation updated with TLS requirements
- [ ] Examples updated with HTTPS configuration
