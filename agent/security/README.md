# Security Audit Index

This directory contains security audit reports for @prmichaelsen/mcp-auth.

## Audit History

### [Audit #001](./audit_001.md) - 2026-02-11
**Version**: 4.0.0  
**Status**: Production Ready with Recommendations  
**Overall Risk**: MEDIUM  
**Security Rating**: B+ (Good)

**Key Findings:**
- 🔴 1 Critical: CORS wildcard default
- ⚠️ 3 High Priority: HTTPS enforcement, esbuild update, rate limiting
- 📋 7 Medium Priority: Various improvements

**Recommendation**: APPROVED FOR PRODUCTION with critical CORS fix applied

---

## Quick Reference

### Critical Issues Tracker

| Issue | Audit | Status | Priority | Resolution |
|-------|-------|--------|----------|------------|
| CORS Wildcard Default | #001 | ✅ RESOLVED | CRITICAL | v5.0.0 (2026-02-11) |
| HTTPS Enforcement | #001 | ⚠️ OPEN | HIGH | Next Release |
| esbuild Vulnerability | #001 | ⚠️ OPEN | MEDIUM | Next Release |
| Default Rate Limiting | #001 | ⚠️ OPEN | HIGH | Next Release |
| Health Endpoint Disclosure | #001 | ⚠️ OPEN | MEDIUM | Next Release |

### Security Metrics

- **Total Audits**: 1
- **Last Audit**: 2026-02-11
- **Critical Issues**: 0 open (1 resolved)
- **High Priority Issues**: 3 open
- **Medium Priority Issues**: 2 open

---

## Audit Schedule

- **Frequency**: Quarterly or after major releases
- **Next Scheduled**: 2026-05-11 (3 months)
- **Trigger Events**: 
  - Major version releases
  - Security incidents
  - Dependency vulnerabilities
  - Production deployment changes

---

## Resources

- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [OWASP Top 10 (2026)](https://owasp.org/www-project-top-ten/)
