# Task 12: Add Multi-Tenant Progress Tracking

**Milestone**: M5 - Progress Streaming - Wrapper Integration  
**Priority**: MEDIUM  
**Status**: Not Started  
**Estimated Time**: 2-3 hours  
**Dependencies**: Task 11 (Progress Notification Forwarding)

---

## Objective

Add comprehensive progress tracking and monitoring for multi-tenant deployments, including metrics, logging, and debugging capabilities.

## Background

With progress streaming enabled, we need visibility into:
- How many users are actively streaming progress
- Progress stream performance and health
- Debugging information for troubleshooting
- Resource usage monitoring

## Steps

### 1. Add Progress Metrics

Extend [`src/wrapper/progress-manager.ts`](src/wrapper/progress-manager.ts) with detailed metrics:

```typescript
/**
 * Detailed progress stream metrics
 */
export interface ProgressStreamMetrics {
  userId: string;
  progressToken: string | number;
  startTime: number;
  lastUpdate: number;
  duration: number;
  messageCount: number;
  bytesTransferred: number;
  averageMessageSize: number;
  messagesPerSecond: number;
}

export class ProgressManager {
  // ... existing code
  
  /**
   * Get detailed metrics for a specific stream
   */
  getStreamMetrics(progressToken: string | number): ProgressStreamMetrics | null {
    const stream = this.streams.get(progressToken);
    if (!stream) return null;
    
    const now = Date.now();
    const duration = now - stream.startTime;
    const messagesPerSecond = stream.messageCount / (duration / 1000);
    
    return {
      userId: stream.userId,
      progressToken: stream.progressToken,
      startTime: stream.startTime,
      lastUpdate: stream.lastUpdate,
      duration,
      messageCount: stream.messageCount,
      bytesTransferred: stream.bytesTransferred || 0,
      averageMessageSize: stream.bytesTransferred 
        ? stream.bytesTransferred / stream.messageCount 
        : 0,
      messagesPerSecond
    };
  }
  
  /**
   * Get metrics for all active streams
   */
  getAllMetrics(): ProgressStreamMetrics[] {
    const metrics: ProgressStreamMetrics[] = [];
    
    for (const token of this.streams.keys()) {
      const metric = this.getStreamMetrics(token);
      if (metric) {
        metrics.push(metric);
      }
    }
    
    return metrics;
  }
  
  /**
   * Get aggregated metrics by user
   */
  getUserMetrics(userId: string): {
    activeStreams: number;
    totalMessages: number;
    totalBytes: number;
    oldestStreamAge: number;
  } {
    const streams = this.getUserStreams(userId);
    const now = Date.now();
    
    let totalMessages = 0;
    let totalBytes = 0;
    let oldestStreamAge = 0;
    
    for (const stream of streams) {
      totalMessages += stream.messageCount;
      totalBytes += stream.bytesTransferred || 0;
      const age = now - stream.startTime;
      if (age > oldestStreamAge) {
        oldestStreamAge = age;
      }
    }
    
    return {
      activeStreams: streams.length,
      totalMessages,
      totalBytes,
      oldestStreamAge
    };
  }
}
```

### 2. Add Progress Monitoring Endpoint

Add monitoring endpoint to [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts):

```typescript
// In startSSETransport() method
private async startSSETransport(): Promise<void> {
  // ... existing setup
  
  // Add progress monitoring endpoint (authenticated)
  app.get(`${basePath}/progress/stats`, async (req: any, res: any) => {
    try {
      // Authenticate request
      const context: RequestContext = {
        headers: req.headers,
        method: req.method,
        path: req.path
      };
      
      const authResult = await this.config.authProvider.authenticate(context);
      
      if (!authResult.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTHENTICATION_ERROR'
        });
      }
      
      const userId = authResult.userId!;
      
      // Get user-specific metrics
      const userMetrics = this.progressManager.getUserMetrics(userId);
      const globalStats = this.progressManager.getStats();
      
      res.json({
        user: {
          userId,
          ...userMetrics
        },
        global: globalStats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Error fetching progress stats', error as Error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
  
  // Add detailed metrics endpoint (admin only)
  app.get(`${basePath}/progress/metrics`, async (req: any, res: any) => {
    try {
      // Authenticate and check admin role
      const context: RequestContext = {
        headers: req.headers,
        method: req.method,
        path: req.path
      };
      
      const authResult = await this.config.authProvider.authenticate(context);
      
      if (!authResult.authenticated) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }
      
      // TODO: Add admin role check
      // For now, return all metrics
      const allMetrics = this.progressManager.getAllMetrics();
      
      res.json({
        metrics: allMetrics,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Error fetching progress metrics', error as Error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  });
}
```

### 3. Add Progress Event Logging

Enhance logging for progress events:

```typescript
// In ProgressManager
export class ProgressManager {
  /**
   * Forward a progress notification with enhanced logging
   */
  forwardNotification(notification: ProgressNotification): boolean {
    const { progressToken, progress, total, message } = notification;
    
    const stream = this.streams.get(progressToken);
    const callback = this.callbacks.get(progressToken);
    
    if (!stream || !callback) {
      this.logger.warn('Progress notification for unknown token', {
        progressToken,
        hasStream: !!stream,
        hasCallback: !!callback
      });
      return false;
    }
    
    // Update stream metadata
    stream.lastUpdate = Date.now();
    stream.messageCount++;
    
    // Track bytes if message provided
    if (message) {
      const bytes = Buffer.byteLength(message, 'utf8');
      stream.bytesTransferred = (stream.bytesTransferred || 0) + bytes;
    }
    
    // Log progress milestones
    if (progress !== undefined && total !== undefined) {
      const percentage = (progress / total) * 100;
      
      // Log at 25%, 50%, 75%, 100%
      if ([25, 50, 75, 100].includes(Math.floor(percentage))) {
        this.logger.info('Progress milestone', {
          userId: stream.userId,
          progressToken,
          percentage: Math.floor(percentage),
          progress,
          total
        });
      }
    }
    
    // Forward to client
    try {
      callback(notification);
      
      // Debug logging for every notification
      this.logger.debug('Progress notification forwarded', {
        userId: stream.userId,
        progressToken,
        messageCount: stream.messageCount,
        progress,
        total,
        messageLength: message?.length || 0
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error forwarding progress notification', error as Error, {
        userId: stream.userId,
        progressToken,
        messageCount: stream.messageCount
      });
      return false;
    }
  }
}
```

### 4. Add Progress Stream Health Checks

Add health monitoring for progress streams:

```typescript
export class ProgressManager {
  /**
   * Check health of all active streams
   */
  checkHealth(): {
    healthy: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];
    const now = Date.now();
    
    for (const [token, stream] of this.streams.entries()) {
      const age = now - stream.startTime;
      const timeSinceUpdate = now - stream.lastUpdate;
      
      // Check for very old streams (>1 hour)
      if (age > 3600000) {
        warnings.push(
          `Stream ${token} for user ${stream.userId} is very old (${Math.floor(age / 60000)} minutes)`
        );
      }
      
      // Check for stale streams (>5 minutes since update)
      if (timeSinceUpdate > 300000) {
        issues.push(
          `Stream ${token} for user ${stream.userId} is stale (${Math.floor(timeSinceUpdate / 60000)} minutes since update)`
        );
      }
      
      // Check for high message rate (>100/sec)
      const duration = age / 1000;
      const rate = stream.messageCount / duration;
      if (rate > 100) {
        warnings.push(
          `Stream ${token} has high message rate (${rate.toFixed(1)}/sec)`
        );
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      warnings
    };
  }
}
```

## Verification

- [ ] Progress metrics tracked accurately
- [ ] Monitoring endpoints return correct data
- [ ] Health checks identify issues
- [ ] Logging provides useful debugging information
- [ ] No performance impact from tracking

## Testing

```typescript
describe('Multi-Tenant Progress Tracking', () => {
  it('should track progress metrics per user', () => {
    const progressManager = new ProgressManager(logger);
    
    progressManager.registerStream('user1', 'token1', () => {});
    progressManager.registerStream('user1', 'token2', () => {});
    progressManager.registerStream('user2', 'token3', () => {});
    
    const user1Metrics = progressManager.getUserMetrics('user1');
    expect(user1Metrics.activeStreams).toBe(2);
    
    const user2Metrics = progressManager.getUserMetrics('user2');
    expect(user2Metrics.activeStreams).toBe(1);
  });
  
  it('should calculate stream metrics correctly', () => {
    const progressManager = new ProgressManager(logger);
    
    progressManager.registerStream('user1', 'token1', () => {});
    
    // Simulate some progress notifications
    for (let i = 0; i < 10; i++) {
      progressManager.forwardNotification({
        progressToken: 'token1',
        message: 'Test message'
      });
    }
    
    const metrics = progressManager.getStreamMetrics('token1');
    expect(metrics?.messageCount).toBe(10);
    expect(metrics?.messagesPerSecond).toBeGreaterThan(0);
  });
  
  it('should detect unhealthy streams', () => {
    const progressManager = new ProgressManager(logger);
    
    progressManager.registerStream('user1', 'token1', () => {});
    
    // Simulate stale stream
    jest.advanceTimersByTime(6 * 60 * 1000);
    
    const health = progressManager.checkHealth();
    expect(health.healthy).toBe(false);
    expect(health.issues.length).toBeGreaterThan(0);
  });
});
```

## Documentation

Update [`README.md`](README.md):

```markdown
### Progress Monitoring

Monitor active progress streams via authenticated endpoints:

**User Stats** (shows your own progress streams):
```bash
GET /mcp/progress/stats
Authorization: Bearer <jwt>
```

**Response**:
```json
{
  "user": {
    "userId": "user123",
    "activeStreams": 2,
    "totalMessages": 1543,
    "totalBytes": 45231,
    "oldestStreamAge": 120000
  },
  "global": {
    "activeStreams": 15,
    "totalMessages": 8234,
    "userCount": 8
  },
  "timestamp": "2026-02-23T21:00:00.000Z"
}
```

**All Metrics** (admin only):
```bash
GET /mcp/progress/metrics
Authorization: Bearer <admin-jwt>
```
```

## Files Modified

- [`src/wrapper/progress-manager.ts`](src/wrapper/progress-manager.ts) - Add metrics and health checks
- [`src/wrapper/server-wrapper.ts`](src/wrapper/server-wrapper.ts) - Add monitoring endpoints
- [`README.md`](README.md) - Document monitoring

## Next Task

[Task 13: Testing and Documentation](task-13-progress-testing-documentation.md)

---

**Created**: 2026-02-23  
**Status**: Not Started  
**Assignee**: TBD
