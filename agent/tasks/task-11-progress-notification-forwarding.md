# Task 11: Implement Progress Notification Forwarding

**Milestone**: M5 - Progress Streaming - Wrapper Integration  
**Priority**: HIGH  
**Status**: Not Started  
**Estimated Time**: 3-4 hours  
**Dependencies**: Task 10 (Progress Token Pass-Through)

---

## Objective

Implement progress notification forwarding from wrapped MCP servers back to clients, ensuring notifications are routed to the correct user in multi-tenant deployments.

## Background

When a wrapped MCP server sends progress notifications, the mcp-auth wrapper must intercept these notifications and forward them to the correct client. This requires:
1. Intercepting server notifications
2. Matching notifications to the correct user/client
3. Forwarding notifications through the transport

## Steps

### 1. Create Progress Manager

Create [`src/wrapper/progress-manager.ts`](src/wrapper/progress-manager.ts):

```typescript
/**
 * Progress notification manager for multi-tenant progress streaming
 * 
 * Manages routing of progress notifications from wrapped MCP servers
 * to the correct clients in multi-tenant deployments.
 */

import { Logger } from '../utils/logger.js';
import type { ProgressNotification } from '../types.js';

/**
 * Progress stream metadata
 */
interface ProgressStream {
  userId: string;
  progressToken: string | number;
  startTime: number;
  lastUpdate: number;
  messageCount: number;
}

/**
 * Progress notification callback
 */
export type ProgressCallback = (notification: ProgressNotification) => void;

/**
 * Manages progress notification routing for multi-tenant deployments
 */
export class ProgressManager {
  private streams: Map<string | number, ProgressStream>;
  private callbacks: Map<string | number, ProgressCallback>;
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.streams = new Map();
    this.callbacks = new Map();
    this.logger = logger;
  }
  
  /**
   * Register a progress stream for a user
   */
  registerStream(
    userId: string,
    progressToken: string | number,
    callback: ProgressCallback
  ): void {
    const stream: ProgressStream = {
      userId,
      progressToken,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      messageCount: 0
    };
    
    this.streams.set(progressToken, stream);
    this.callbacks.set(progressToken, callback);
    
    this.logger.debug('Progress stream registered', {
      userId,
      progressToken
    });
  }
  
  /**
   * Forward a progress notification to the correct client
   */
  forwardNotification(notification: ProgressNotification): boolean {
    const { progressToken } = notification;
    
    const stream = this.streams.get(progressToken);
    const callback = this.callbacks.get(progressToken);
    
    if (!stream || !callback) {
      this.logger.warn('Progress notification for unknown token', {
        progressToken
      });
      return false;
    }
    
    // Update stream metadata
    stream.lastUpdate = Date.now();
    stream.messageCount++;
    
    // Forward to client
    try {
      callback(notification);
      
      this.logger.debug('Progress notification forwarded', {
        userId: stream.userId,
        progressToken,
        messageCount: stream.messageCount
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error forwarding progress notification', error as Error, {
        userId: stream.userId,
        progressToken
      });
      return false;
    }
  }
  
  /**
   * Unregister a progress stream
   */
  unregisterStream(progressToken: string | number): void {
    const stream = this.streams.get(progressToken);
    
    if (stream) {
      const duration = Date.now() - stream.startTime;
      
      this.logger.debug('Progress stream unregistered', {
        userId: stream.userId,
        progressToken,
        duration,
        messageCount: stream.messageCount
      });
    }
    
    this.streams.delete(progressToken);
    this.callbacks.delete(progressToken);
  }
  
  /**
   * Get active streams for a user
   */
  getUserStreams(userId: string): ProgressStream[] {
    const streams: ProgressStream[] = [];
    
    for (const stream of this.streams.values()) {
      if (stream.userId === userId) {
        streams.push(stream);
      }
    }
    
    return streams;
  }
  
  /**
   * Clean up stale streams (no updates for 5 minutes)
   */
  cleanupStaleStreams(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const toRemove: (string | number)[] = [];
    
    for (const [token, stream] of this.streams.entries()) {
      if (now - stream.lastUpdate > staleThreshold) {
        toRemove.push(token);
      }
    }
    
    for (const token of toRemove) {
      this.unregisterStream(token);
      this.logger.warn('Cleaned up stale progress stream', { progressToken: token });
    }
  }
  
  /**
   * Get statistics about active streams
   */
  getStats(): {
    activeStreams: number;
    totalMessages: number;
    userCount: number;
  } {
    const userIds = new Set<string>();
    let totalMessages = 0;
    
    for (const stream of this.streams.values()) {
      userIds.add(stream.userId);
      totalMessages += stream.messageCount;
    }
    
    return {
      activeStreams: this.streams.size,
      totalMessages,
      userCount: userIds.size
    };
  }
}
```

### 2. Integrate Progress Manager into Wrapper

Update [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts):

```typescript
import { ProgressManager } from './progress-manager.js';

export class AuthenticatedServerWrapper {
  private progressManager: ProgressManager;
  
  constructor(config: ServerWrapperConfig) {
    // ... existing initialization
    
    // Initialize progress manager
    this.progressManager = new ProgressManager(this.logger);
    
    // Schedule periodic cleanup of stale streams
    setInterval(() => {
      this.progressManager.cleanupStaleStreams();
    }, 60000); // Every minute
  }
  
  // ... rest of class
}
```

### 3. Intercept Server Notifications

Add notification interception in SSE transport handler:

```typescript
// In startSSETransport() method
private async startSSETransport(): Promise<void> {
  // ... existing setup
  
  app.post(`${basePath}/message`, async (req: any, res: any) => {
    try {
      // ... authentication
      
      const userId = authResult.userId!;
      const progressToken = req.body._meta?.progressToken;
      
      // Register progress stream if token provided
      if (progressToken) {
        this.progressManager.registerStream(
          userId,
          progressToken,
          (notification) => {
            // Forward notification to client via SSE
            this.sendProgressNotification(res, notification);
          }
        );
      }
      
      // Get server instance
      const server = await this.getOrCreateServer(userId);
      
      // Intercept server notifications
      const originalNotification = server.notification.bind(server);
      server.notification = (params: any) => {
        // Check if this is a progress notification
        if (params.method === 'notifications/progress') {
          const handled = this.progressManager.forwardNotification(
            params.params as ProgressNotification
          );
          
          if (handled) {
            return; // Don't send through original path
          }
        }
        
        // Forward other notifications normally
        originalNotification(params);
      };
      
      // ... handle request
      
      // Cleanup on completion
      if (progressToken) {
        this.progressManager.unregisterStream(progressToken);
      }
      
    } catch (error) {
      // ... error handling
    }
  });
}

/**
 * Send progress notification to client via SSE
 */
private sendProgressNotification(
  res: any,
  notification: ProgressNotification
): void {
  try {
    // Send as SSE event
    res.write(`event: progress\n`);
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
    
    this.logger.debug('Progress notification sent', {
      progressToken: notification.progressToken
    });
  } catch (error) {
    this.logger.error('Error sending progress notification', error as Error);
  }
}
```

### 4. Add Multi-Tenant Isolation

Ensure progress notifications don't leak between users:

```typescript
/**
 * Verify progress notification belongs to user
 */
private verifyProgressOwnership(
  userId: string,
  progressToken: string | number
): boolean {
  const streams = this.progressManager.getUserStreams(userId);
  return streams.some(s => s.progressToken === progressToken);
}
```

## Verification

- [ ] Progress notifications intercepted from wrapped server
- [ ] Notifications routed to correct client
- [ ] No cross-user notification leakage
- [ ] Stale streams cleaned up automatically
- [ ] Statistics tracking works correctly

## Testing

```typescript
describe('Progress Notification Forwarding', () => {
  it('should forward progress notifications to correct client', async () => {
    const progressManager = new ProgressManager(logger);
    const notifications: ProgressNotification[] = [];
    
    progressManager.registerStream('user1', 'token1', (n) => {
      notifications.push(n);
    });
    
    progressManager.forwardNotification({
      progressToken: 'token1',
      progress: 50,
      total: 100,
      message: 'Processing...'
    });
    
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('Processing...');
  });
  
  it('should not leak notifications between users', async () => {
    const progressManager = new ProgressManager(logger);
    const user1Notifications: ProgressNotification[] = [];
    const user2Notifications: ProgressNotification[] = [];
    
    progressManager.registerStream('user1', 'token1', (n) => {
      user1Notifications.push(n);
    });
    
    progressManager.registerStream('user2', 'token2', (n) => {
      user2Notifications.push(n);
    });
    
    // Send to user1
    progressManager.forwardNotification({
      progressToken: 'token1',
      message: 'User 1 progress'
    });
    
    // Verify only user1 received it
    expect(user1Notifications).toHaveLength(1);
    expect(user2Notifications).toHaveLength(0);
  });
  
  it('should clean up stale streams', async () => {
    const progressManager = new ProgressManager(logger);
    
    progressManager.registerStream('user1', 'token1', () => {});
    
    // Simulate stale stream (5+ minutes old)
    jest.advanceTimersByTime(6 * 60 * 1000);
    
    progressManager.cleanupStaleStreams();
    
    const stats = progressManager.getStats();
    expect(stats.activeStreams).toBe(0);
  });
});
```

## Documentation

Update [`README.md`](README.md):

```markdown
### Progress Notification Forwarding

The mcp-auth wrapper automatically forwards progress notifications from wrapped MCP servers to clients:

1. **Client sends request** with `progressToken`
2. **Wrapper registers** progress stream for user
3. **Wrapped server sends** progress notifications
4. **Wrapper intercepts** and routes to correct client
5. **Client receives** real-time progress updates

**Multi-Tenant Isolation**: Progress notifications are isolated per user. Users cannot see progress from other users' operations.

**Automatic Cleanup**: Stale progress streams (no updates for 5 minutes) are automatically cleaned up.
```

## Files Created

- [`src/wrapper/progress-manager.ts`](src/wrapper/progress-manager.ts) - Progress notification manager

## Files Modified

- [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts) - Integrate progress manager
- [`src/wrapper/index.ts`](src/wrapper/index.ts) - Export ProgressManager
- [`README.md`](README.md) - Document progress forwarding

## Next Task

[Task 12: Add Multi-Tenant Progress Tracking](task-12-multi-tenant-progress-tracking.md)

---

**Created**: 2026-02-23  
**Status**: Not Started  
**Assignee**: TBD
