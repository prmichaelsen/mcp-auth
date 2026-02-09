/**
 * Base authentication provider implementation
 * 
 * Provides common functionality for authentication providers.
 */

import type { AuthProvider, AuthProviderConfig } from './types.js';
import type { RequestContext, AuthResult } from '../types.js';
import { AuthenticationError } from '../utils/errors.js';
import { createLogger, type Logger } from '../utils/logger.js';

/**
 * Abstract base class for authentication providers
 * 
 * Provides common functionality like caching, logging, and error handling.
 * Extend this class to implement custom authentication logic.
 * 
 * @example
 * ```typescript
 * class MyAuthProvider extends BaseAuthProvider {
 *   protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
 *     // Your authentication logic here
 *     return { authenticated: true, userId: 'user-123' };
 *   }
 * }
 * ```
 */
export abstract class BaseAuthProvider implements AuthProvider {
  protected config: AuthProviderConfig;
  protected logger: Logger;
  private authCache: Map<string, { result: AuthResult; expiresAt: number }>;
  
  constructor(config: AuthProviderConfig = {}) {
    this.config = {
      errorMessages: {
        noAuth: 'No authentication credentials provided',
        invalidAuth: 'Invalid authentication credentials',
        expiredAuth: 'Authentication credentials have expired',
        ...config.errorMessages
      },
      cacheResults: config.cacheResults ?? false,
      cacheTtl: config.cacheTtl ?? 60000 // 1 minute default
    };
    
    this.logger = createLogger({ enabled: true, level: 'info' });
    this.authCache = new Map();
  }
  
  /**
   * Authenticate a request
   * Implements caching if enabled
   */
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Generate cache key from context
      const cacheKey = this.getCacheKey(context);
      
      // Check cache if enabled
      if (this.config.cacheResults && cacheKey) {
        const cached = this.authCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          this.logger.debug('Authentication result retrieved from cache', {
            cacheKey,
            userId: cached.result.userId
          });
          return cached.result;
        }
      }
      
      // Perform authentication
      const result = await this.doAuthenticate(context);
      
      // Cache result if successful and caching is enabled
      if (result.authenticated && this.config.cacheResults && cacheKey) {
        this.authCache.set(cacheKey, {
          result,
          expiresAt: Date.now() + (this.config.cacheTtl ?? 60000)
        });
        
        this.logger.debug('Authentication result cached', {
          cacheKey,
          userId: result.userId,
          ttl: this.config.cacheTtl
        });
      }
      
      // Log result
      if (result.authenticated) {
        this.logger.info('Authentication successful', {
          userId: result.userId,
          transport: context.transport
        });
      } else {
        this.logger.warn('Authentication failed', {
          error: result.error,
          transport: context.transport
        });
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Authentication error', error as Error, {
        transport: context.transport
      });
      
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  /**
   * Abstract method to implement authentication logic
   * Override this in your provider implementation
   */
  protected abstract doAuthenticate(context: RequestContext): Promise<AuthResult>;
  
  /**
   * Generate cache key from request context
   * Override this to customize caching behavior
   */
  protected getCacheKey(context: RequestContext): string | null {
    // Default: use authorization header as cache key
    const authHeader = context.headers?.['authorization'];
    if (typeof authHeader === 'string') {
      return authHeader;
    }
    return null;
  }
  
  /**
   * Extract authorization header from context
   */
  protected getAuthorizationHeader(context: RequestContext): string | null {
    const authHeader = context.headers?.['authorization'];
    
    if (typeof authHeader === 'string') {
      return authHeader;
    }
    
    if (Array.isArray(authHeader) && authHeader.length > 0) {
      return authHeader[0];
    }
    
    return null;
  }
  
  /**
   * Extract bearer token from authorization header
   */
  protected extractBearerToken(context: RequestContext): string | null {
    const authHeader = this.getAuthorizationHeader(context);
    
    if (!authHeader) {
      return null;
    }
    
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    
    return null;
  }
  
  /**
   * Create authentication failure result
   */
  protected createFailureResult(error: string): AuthResult {
    return {
      authenticated: false,
      error
    };
  }
  
  /**
   * Create authentication success result
   */
  protected createSuccessResult(
    userId: string,
    metadata?: Record<string, unknown>
  ): AuthResult {
    return {
      authenticated: true,
      userId,
      metadata
    };
  }
  
  /**
   * Optional: Initialize the provider
   */
  async initialize(): Promise<void> {
    this.logger.info('Authentication provider initialized', {
      provider: this.constructor.name,
      cacheEnabled: this.config.cacheResults
    });
  }
  
  /**
   * Optional: Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear cache
    this.authCache.clear();
    
    this.logger.info('Authentication provider cleaned up', {
      provider: this.constructor.name
    });
  }
  
  /**
   * Optional: Validate provider configuration
   */
  async validate(): Promise<boolean> {
    // Base implementation always returns true
    // Override in subclasses to add validation logic
    return true;
  }
  
  /**
   * Clear authentication cache
   */
  clearCache(): void {
    this.authCache.clear();
    this.logger.debug('Authentication cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.authCache.size,
      keys: Array.from(this.authCache.keys())
    };
  }
}
