/**
 * Instance Pool Manager
 * 
 * Manages lifecycle of pooled server instances with configurable
 * size limits, idle timeouts, and maximum lifetimes.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { InstancePoolConfig } from '../types.js';
import type { Logger } from '../utils/logger.js';

/**
 * Metadata for a pooled server instance
 */
interface InstanceMetadata {
  /** The MCP server instance */
  server: Server;
  
  /** User ID this instance belongs to */
  userId: string;
  
  /** Access token used to create this instance */
  accessToken: string;
  
  /** Timestamp when instance was created */
  createdAt: number;
  
  /** Timestamp when instance was last used */
  lastUsed: number;
}

/**
 * Instance Pool Manager
 * 
 * Manages a pool of server instances with automatic lifecycle management:
 * - Reuses instances for the same user
 * - Enforces maximum pool size with LRU eviction
 * - Automatically closes idle instances
 * - Forces refresh of old instances
 * - Periodic cleanup of expired instances
 * 
 * @example
 * ```typescript
 * const poolManager = new InstancePoolManager({
 *   maxSize: 10,
 *   idleTimeout: 300000,
 *   maxLifetime: 3600000
 * }, logger);
 * 
 * const server = await poolManager.getInstance(
 *   'user123',
 *   'token456',
 *   (token, userId) => createMyServer(token, userId)
 * );
 * ```
 */
export class InstancePoolManager {
  private instances: Map<string, InstanceMetadata>;
  private config: InstancePoolConfig;
  private logger: Logger;
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(config: InstancePoolConfig, logger: Logger) {
    this.instances = new Map();
    this.config = config;
    this.logger = logger;
    this.startCleanupTimer();
    
    this.logger.info('InstancePoolManager initialized', {
      maxSize: config.maxSize,
      idleTimeout: config.idleTimeout,
      maxLifetime: config.maxLifetime
    });
  }
  
  /**
   * Get or create a server instance for a user
   * 
   * If a valid instance exists for the user, it will be reused.
   * Otherwise, a new instance will be created using the factory function.
   * 
   * @param userId - User identifier
   * @param accessToken - Access token for the user
   * @param factory - Factory function to create new server instances
   * @returns Server instance (existing or newly created)
   */
  async getInstance(
    userId: string,
    accessToken: string,
    factory: (accessToken: string, userId: string) => Server | Promise<Server>
  ): Promise<Server> {
    // Check if instance exists and is valid
    const existing = this.instances.get(userId);
    if (existing && this.isValid(existing)) {
      this.logger.debug('Reusing pooled instance', { userId });
      existing.lastUsed = Date.now();
      return existing.server;
    }
    
    // Remove invalid instance if exists
    if (existing) {
      this.logger.debug('Removing invalid instance', { 
        userId,
        age: Date.now() - existing.createdAt,
        idle: Date.now() - existing.lastUsed
      });
      await this.removeInstance(userId);
    }
    
    // Check pool size limit
    if (this.instances.size >= this.config.maxSize) {
      this.logger.debug('Pool full, evicting LRU instance', { 
        size: this.instances.size,
        maxSize: this.config.maxSize
      });
      await this.evictLeastRecentlyUsed();
    }
    
    // Create new instance
    this.logger.debug('Creating new pooled instance', { userId });
    const server = await factory(accessToken, userId);
    
    this.instances.set(userId, {
      server,
      userId,
      accessToken,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
    
    this.logger.info('Pooled instance created', {
      userId,
      poolSize: this.instances.size
    });
    
    return server;
  }
  
  /**
   * Check if an instance is still valid
   * 
   * An instance is valid if:
   * - It hasn't exceeded its maximum lifetime
   * - It hasn't been idle for too long
   * 
   * @param instance - Instance metadata to check
   * @returns true if instance is valid, false otherwise
   */
  private isValid(instance: InstanceMetadata): boolean {
    const now = Date.now();
    const age = now - instance.createdAt;
    const idle = now - instance.lastUsed;
    
    const valid = age < this.config.maxLifetime && 
                  idle < this.config.idleTimeout;
    
    if (!valid) {
      this.logger.debug('Instance invalid', {
        userId: instance.userId,
        age,
        idle,
        maxLifetime: this.config.maxLifetime,
        idleTimeout: this.config.idleTimeout,
        reason: age >= this.config.maxLifetime ? 'max lifetime exceeded' : 'idle timeout exceeded'
      });
    }
    
    return valid;
  }
  
  /**
   * Evict the least recently used instance
   * 
   * Finds the instance with the oldest lastUsed timestamp
   * and removes it from the pool.
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldestUserId: string | null = null;
    let oldestTime = Date.now();
    
    for (const [userId, instance] of this.instances.entries()) {
      if (instance.lastUsed < oldestTime) {
        oldestTime = instance.lastUsed;
        oldestUserId = userId;
      }
    }
    
    if (oldestUserId) {
      this.logger.info('Evicting LRU instance', { 
        userId: oldestUserId,
        lastUsed: new Date(oldestTime).toISOString(),
        idleTime: Date.now() - oldestTime
      });
      await this.removeInstance(oldestUserId);
    }
  }
  
  /**
   * Remove an instance from the pool
   * 
   * Closes the server instance (if it has a close method)
   * and removes it from the pool.
   * 
   * @param userId - User ID of the instance to remove
   */
  private async removeInstance(userId: string): Promise<void> {
    const instance = this.instances.get(userId);
    if (instance) {
      try {
        // Close server if it has a close method
        if ('close' in instance.server && typeof instance.server.close === 'function') {
          await instance.server.close();
          this.logger.debug('Server instance closed', { userId });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error closing instance for user ${userId}: ${errorMessage}`);
      }
      this.instances.delete(userId);
      this.logger.debug('Instance removed from pool', {
        userId,
        poolSize: this.instances.size
      });
    }
  }
  
  /**
   * Start periodic cleanup timer
   * 
   * Runs cleanup every minute to remove expired instances.
   */
  private startCleanupTimer(): void {
    // Run cleanup every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredInstances();
    }, 60000);
    
    // Don't keep the process alive just for this timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Clean up expired instances
   * 
   * Removes all instances that are no longer valid
   * (exceeded max lifetime or idle timeout).
   */
  private async cleanupExpiredInstances(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [userId, instance] of this.instances.entries()) {
      if (!this.isValid(instance)) {
        toRemove.push(userId);
      }
    }
    
    if (toRemove.length > 0) {
      this.logger.info('Cleaning up expired instances', { 
        count: toRemove.length,
        userIds: toRemove
      });
      
      for (const userId of toRemove) {
        await this.removeInstance(userId);
      }
    }
  }
  
  /**
   * Close all pooled instances
   * 
   * Closes all server instances and clears the pool.
   * Should be called when shutting down the server.
   */
  async closeAll(): Promise<void> {
    this.logger.info('Closing all pooled instances', { 
      count: this.instances.size 
    });
    
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Close all instances
    const userIds = Array.from(this.instances.keys());
    for (const userId of userIds) {
      await this.removeInstance(userId);
    }
    
    this.logger.info('All pooled instances closed');
  }
  
  /**
   * Get pool statistics
   * 
   * Returns current state of the pool for monitoring and debugging.
   * 
   * @returns Pool statistics including size and instance details
   */
  getStats() {
    const now = Date.now();
    return {
      size: this.instances.size,
      maxSize: this.config.maxSize,
      instances: Array.from(this.instances.values()).map(i => ({
        userId: i.userId,
        age: now - i.createdAt,
        idle: now - i.lastUsed,
        createdAt: new Date(i.createdAt).toISOString(),
        lastUsed: new Date(i.lastUsed).toISOString()
      }))
    };
  }
}
