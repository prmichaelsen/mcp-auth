# Security Enhancement: Enable Default Rate Limiting

**Priority**: ⚠️ HIGH  
**Status**: Open  
**Created**: 2026-02-11  
**Source**: Security Audit #001  
**Risk Level**: MEDIUM

## Problem

Rate limiting is available but **not enabled by default**, leaving the server vulnerable to:
- Denial of Service (DoS) attacks
- Brute force authentication attempts
- Resource exhaustion
- API abuse

## Current Implementation

Rate limiting exists but requires manual configuration:

```typescript
// Current: Optional, not enabled by default
const wrapped = wrapServer({
  middleware: {
    rateLimit: {  // ⚠️ Must be explicitly configured
      enabled: true,
      maxRequests: 100,
      windowMs: 60000
    }
  }
});
```

## Security Impact

- **Availability**: HIGH - Server can be overwhelmed
- **Cost**: MEDIUM - Excessive API calls to external services
- **Performance**: MEDIUM - Legitimate users affected by abuse

**CVSS Score**: 5.3 (Medium)

## Solution

### 1. Enable Rate Limiting by Default

```typescript
// src/wrapper/config.ts
private normalizeConfig(config: ServerWrapperConfig): NormalizedServerWrapperConfig {
  return {
    // ... other config
    middleware: {
      rateLimit: config.middleware?.rateLimit ?? {
        enabled: true,  // ✅ Enabled by default
        maxRequests: 100,
        windowMs: 60000,  // 100 requests per minute
        message: 'Rate limit exceeded. Please try again later.'
      },
      logging: config.middleware?.logging ?? { enabled: true, level: 'info' }
    },
    // ...
  };
}
```

### 2. Implement Rate Limiting Middleware

```typescript
// src/wrapper/server-wrapper.ts
private async startSSETransport(): Promise<void> {
  const express = await import('express');
  const app = express.default();
  
  // Apply rate limiting if enabled
  if (this.config.middleware.rateLimit?.enabled) {
    app.use(this.createRateLimitMiddleware());
  }
  
  // ... rest of setup
}

private createRateLimitMiddleware() {
  const limiter = new Map<string, number[]>();
  const config = this.config.middleware.rateLimit!;
  
  return (req: any, res: any, next: any) => {
    // Extract user ID from JWT (if available)
    const authHeader = req.headers.authorization;
    let key = req.ip; // Default to IP-based
    
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = this.decodeJWT(token);
        key = decoded.userId || req.ip;
      } catch {
        // Use IP if JWT decode fails
      }
    }
    
    const now = Date.now();
    const timestamps = limiter.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < config.windowMs);
    
    if (validTimestamps.length >= config.maxRequests) {
      const retryAfter = Math.ceil((validTimestamps[0] + config.windowMs - now) / 1000);
      
      this.logger.warn('Rate limit exceeded', {
        key,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs
      });
      
      res.status(429).json({
        error: config.message || 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter
      });
      return;
    }
    
    validTimestamps.push(now);
    limiter.set(key, validTimestamps);
    next();
  };
}
```

### 3. Add Distributed Rate Limiting Support

```typescript
// For production with multiple instances
export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  
  /**
   * Rate limiting store (for distributed systems)
   * @default 'memory' (single instance)
   */
  store?: 'memory' | 'redis';
  
  /**
   * Redis configuration (if store is 'redis')
   */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}
```

## Implementation Steps

1. Update `RateLimitConfig` with default enabled
2. Implement rate limiting middleware in `AuthenticatedServerWrapper`
3. Add IP-based and user-based rate limiting
4. Add Redis support for distributed rate limiting
5. Update documentation with rate limiting examples
6. Add tests for rate limiting
7. Add monitoring/metrics for rate limit hits

## Testing

```typescript
describe('Rate Limiting', () => {
  it('should be enabled by default', () => {
    const wrapper = new AuthenticatedServerWrapper({
      // No middleware config
    });
    
    expect(wrapper.config.middleware.rateLimit.enabled).toBe(true);
  });
  
  it('should reject requests after limit', async () => {
    const wrapper = wrapServer({
      middleware: {
        rateLimit: {
          enabled: true,
          maxRequests: 5,
          windowMs: 60000
        }
      }
    });
    
    // Make 5 requests (should succeed)
    for (let i = 0; i < 5; i++) {
      await expect(makeRequest()).resolves.toBeDefined();
    }
    
    // 6th request should be rate limited
    await expect(makeRequest()).rejects.toThrow('Rate limit exceeded');
  });
  
  it('should reset after time window', async () => {
    // Test window expiration
  });
});
```

## Configuration Examples

### Default (Recommended)

```typescript
// Rate limiting enabled by default
const wrapped = wrapServer({
  // ... other config
  // Rate limiting: 100 req/min per user
});
```

### Custom Limits

```typescript
const wrapped = wrapServer({
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 1000,  // Higher limit
      windowMs: 3600000   // 1 hour window
    }
  }
});
```

### Disabled (Not Recommended)

```typescript
const wrapped = wrapServer({
  middleware: {
    rateLimit: {
      enabled: false  // ⚠️ Not recommended for production
    }
  }
});
```

## Timeline

- **Target**: v5.0.0 release
- **Estimated Effort**: 4-5 hours
- **Breaking Change**: No (sensible default)
- **Priority**: High (DoS protection)

## References

- Security Audit #001: `agent/security/audit_001.md`
- OWASP Rate Limiting: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
- Express Rate Limit: https://www.npmjs.com/package/express-rate-limit

## Acceptance Criteria

- [ ] Rate limiting enabled by default (100 req/min)
- [ ] IP-based rate limiting for unauthenticated requests
- [ ] User-based rate limiting for authenticated requests
- [ ] Configurable limits and windows
- [ ] Redis support for distributed deployments
- [ ] Tests added for rate limiting
- [ ] Documentation updated with examples
- [ ] Monitoring metrics added
