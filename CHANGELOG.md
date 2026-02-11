# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.0.0] - 2026-02-11

### Changed

- Version bump to align with internal versioning
- No functional changes from 5.0.0

## [6.0.0] - 2026-02-11

### Changed

- Version bump (internal release)
- No functional changes from 5.0.0

## [5.0.0] - 2026-02-11

### 🔒 Security

#### BREAKING: CORS Wildcard Protection (CRITICAL)

**Issue**: Default CORS configuration allowed wildcard (`*`) origin, enabling CSRF attacks from any website.

**Fix**: 
- `corsOrigin` is now **REQUIRED** when `cors: true`
- Wildcard (`*`) is **BLOCKED** in production (`NODE_ENV === 'production'`)
- Wildcard allowed in development with warning
- Enhanced CORS configuration with security best practices

**Migration Required**:

```typescript
// ❌ Before (4.x) - Insecure default
transport: {
  type: 'sse',
  cors: true  // Defaulted to wildcard
}

// ✅ After (5.x) - Explicit origin required
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: 'https://your-app.example.com'  // REQUIRED
}
```

**Impact**: 
- **CVSS Score**: 8.1 (High) → 0.0 (Resolved)
- **Security Rating**: B+ → A-
- Prevents CSRF attacks from malicious websites
- Ensures only authorized origins can access MCP server

**Files Changed**:
- `src/wrapper/server-wrapper.ts`: Added CORS validation and security enforcement
- `src/types.ts`: Enhanced `TransportConfig.corsOrigin` documentation
- `README.md`: Added "⚠️ CORS Security" section
- `examples/api-token-resolution/index.ts`: Updated with secure configuration

**References**:
- Security Audit #001: `agent/security/audit_001.md`
- Task: `agent/tasks/fix-cors-wildcard-security.md`
- OWASP CORS Security: https://owasp.org/www-project-web-security-testing-guide/

### Changed

- Enhanced CORS configuration with security best practices:
  - `credentials: true` - Allow credentials in CORS requests
  - Explicit methods: `['GET', 'POST', 'OPTIONS']`
  - Explicit headers: `['Content-Type', 'Authorization', 'X-Request-ID']`
  - Exposed headers: `['X-Request-ID']`
  - `maxAge: 86400` (24 hours) - Cache preflight requests

### Documentation

- Added comprehensive CORS security documentation to README.md
- Added security warnings to `TransportConfig.corsOrigin` JSDoc
- Updated examples with secure CORS configuration
- Added visual distinction between secure (✅) and insecure (❌) patterns

---

## [4.0.0] - 2026-02-11

### Added

- Production-validated server wrapping pattern
- Ephemeral instance architecture for enhanced security
- JWT forwarding with API-based token resolution
- StreamableHTTPServerTransport integration for SSE
- Comprehensive security audit (#001)

### Changed

- Version bump to 4.0.0 reflecting production maturity
- Updated architecture documentation

### Fixed

- SSE endpoint routing (added root endpoint and health check)
- Type definitions generation (removed composite: true)
- Tool naming convention (removed double prefix bug)

---

## [3.0.0] - 2026-02-10

### Added

- Dual-pattern architecture (Server Wrapping + Tool-Level Auth)
- JWTAuthProvider with token extraction
- APITokenResolver for API-based token resolution
- JWTTokenResolver for JWT-embedded tokens
- Middleware composition (withAuth, withLogging, withRateLimit, withTimeout, withRetry)
- Server pooling for performance optimization
- Comprehensive examples

### Changed

- Refactored authentication provider architecture
- Enhanced error handling and logging
- Improved TypeScript type definitions

---

## [2.0.0] - 2026-02-09

### Added

- Tool-level authentication pattern
- AuthenticatedMCPServer class
- Decorator-based middleware system
- EnvAuthProvider and SimpleTokenResolver

### Changed

- Simplified provider interface
- Enhanced validation utilities

---

## [1.0.0] - 2026-02-08

### Added

- Initial release
- Basic authentication framework
- Provider interface
- Transport abstraction
- Core utilities (errors, logging, validation)

---

## Migration Guides

### Migrating from 4.x to 5.x

**Required Changes**:

1. **Add `corsOrigin` when CORS is enabled**:

```typescript
// Before
transport: {
  type: 'sse',
  cors: true
}

// After
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: process.env.CORS_ORIGIN || 'https://app.example.com'
}
```

2. **Update environment variables**:

```bash
# Add to your .env file
CORS_ORIGIN=https://your-app.example.com

# Or for multiple origins (comma-separated)
CORS_ORIGIN=https://app1.example.com,https://app2.example.com
```

3. **For development only** (not recommended):

```typescript
// Development only - will log warning
transport: {
  type: 'sse',
  cors: true,
  corsOrigin: '*'  // Only works when NODE_ENV !== 'production'
}
```

**No Changes Required If**:
- You're using `stdio` transport (CORS not applicable)
- You're not enabling CORS (`cors: false` or omitted)
- You already specify explicit `corsOrigin`

---

[7.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v6.0.0...v7.0.0
[6.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v4.0.0...v5.0.0
[4.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/prmichaelsen/mcp-auth/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/prmichaelsen/mcp-auth/releases/tag/v1.0.0
