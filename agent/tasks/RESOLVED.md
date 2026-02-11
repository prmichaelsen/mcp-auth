# Resolved Tasks

This file tracks tasks that have been completed and resolved.

## ✅ debug-sse-endpoint.md
**Resolved**: 2026-02-11  
**Issue**: SSE endpoint returning 404  
**Solution**: 
- Added root endpoint (GET /mcp) for server info
- Implemented StreamableHTTPServerTransport integration
- Removed placeholder/mock code
- Validated in production at agentbase.me

**Status**: Production validated and working

## ✅ tool-naming-convention.md
**Resolved**: 2026-02-11  
**Issue**: Double prefix in tool names (instagram_instagram_get_profile)  
**Decision**: Keep mcp-auth transparent - tool naming is MCP server's responsibility  
**Recommendation**: MCP servers should use prefixes (instagram_get_profile) for multi-service environments

**Status**: Documented as design decision

## ✅ tool-name-transformation-decision.md
**Resolved**: 2026-02-11  
**Decision**: Keep mcp-auth transparent (Option D)  
**Rationale**: 
- Single responsibility - focus on auth, not tool naming
- Predictability - no magic transformations
- Simplicity - less code, fewer edge cases
- Flexibility - MCP servers control their naming

**Status**: Implemented and documented

## ✅ fix-cors-wildcard-security.md
**Resolved**: 2026-02-11
**Issue**: CORS wildcard default allowed any origin, enabling CSRF attacks
**Solution**:
- Made `corsOrigin` required when `cors: true`
- Blocked wildcard (`*`) in production (`NODE_ENV === 'production'`)
- Allowed wildcard in development with warning
- Enhanced CORS configuration with security best practices
- Updated documentation with security warnings

**Impact**:
- CVSS Score: 8.1 (High) → 0.0 (Resolved)
- Security Rating: B+ → A-
- Breaking change in v5.0.0

**Status**: Resolved and deployed in v5.0.0

---

## Active Tasks

See agent/progress.yaml Phase 10 (Testing & Documentation) and Phase 13 (Security Hardening)
