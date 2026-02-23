# Milestone 5: Progress Streaming - Wrapper Integration (mcp-auth)

**Goal**: Integrate progress streaming support in mcp-auth wrapper
**Duration**: 3-5 days
**Dependencies**: M4 (acp-mcp server implementation)
**Status**: Not Started
**Project**: mcp-auth (separate repository)

---

## Overview

Update the mcp-auth wrapper to pass through progress notifications from acp-mcp to clients. This enables progress streaming for multi-tenant deployments where mcp-auth sits between clients and acp-mcp servers.

**Note**: This milestone is for a DIFFERENT project (mcp-auth). Implementation happens in the mcp-auth repository, not acp-mcp.

## Deliverables

- ✅ Progress token pass-through from client to acp-mcp
- ✅ Progress notification forwarding from acp-mcp to client
- ✅ Per-user progress tracking (multi-tenant)
- ✅ Error handling for progress failures
- ✅ Testing with multiple concurrent users
- ✅ Documentation updates

## Success Criteria

- [ ] mcp-auth passes `progressToken` from client to acp-mcp
- [ ] mcp-auth forwards progress notifications from acp-mcp to correct client
- [ ] Multiple users can stream progress simultaneously
- [ ] Progress notifications don't leak between users
- [ ] Existing functionality unaffected
- [ ] Tests verify progress pass-through
- [ ] Documentation updated

## Key Files to Create

- `src/progress-manager.ts` - Manage per-user progress streams (in mcp-auth)

## Key Files to Modify

- `src/server-factory.ts` - Pass through progressToken (in mcp-auth)
- `src/notification-handler.ts` - Forward progress notifications (in mcp-auth)
- `README.md` - Document progress support (in mcp-auth)

---

## Tasks

### Task 10: Implement Progress Token Pass-Through
**Project**: mcp-auth
**Estimated**: 2-3 hours

### Task 11: Implement Progress Notification Forwarding
**Project**: mcp-auth
**Estimated**: 3-4 hours

### Task 12: Add Multi-Tenant Progress Tracking
**Project**: mcp-auth
**Estimated**: 2-3 hours

### Task 13: Testing and Documentation (mcp-auth)
**Project**: mcp-auth
**Estimated**: 2-3 hours

---

**Next Milestone**: M6 - Progress Streaming - Client Integration (agentbase.me)
**Blockers**: M4 must be complete
**Related Design**: [`agent/design/local.progress-streaming.md`](../design/local.progress-streaming.md)
**Repository**: https://github.com/prmichaelsen/mcp-auth (separate project)
