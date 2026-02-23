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
  bytesTransferred?: number;
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
  
  /**
   * Get detailed metrics for a specific stream
   */
  getStreamMetrics(progressToken: string | number): ProgressStreamMetrics | null {
    const stream = this.streams.get(progressToken);
    if (!stream) return null;
    
    const now = Date.now();
    const duration = now - stream.startTime;
    const messagesPerSecond = duration > 0 ? stream.messageCount / (duration / 1000) : 0;
    
    return {
      userId: stream.userId,
      progressToken: stream.progressToken,
      startTime: stream.startTime,
      lastUpdate: stream.lastUpdate,
      duration,
      messageCount: stream.messageCount,
      bytesTransferred: stream.bytesTransferred || 0,
      averageMessageSize: stream.bytesTransferred && stream.messageCount > 0
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
      if (duration > 0) {
        const rate = stream.messageCount / duration;
        if (rate > 100) {
          warnings.push(
            `Stream ${token} has high message rate (${rate.toFixed(1)}/sec)`
          );
        }
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      warnings
    };
  }
}

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
