/**
 * Simple token resolver for single-user scenarios
 * 
 * Resolves tokens from environment variables. Useful for local development
 * and single-user deployments where all users share the same token.
 */

import type { ResourceTokenResolver, TokenResolverConfig } from '../types.js';
import { TokenResolutionError, MissingCredentialsError } from '../../utils/errors.js';
import { createLogger, type Logger } from '../../utils/logger.js';
import { validateAccessToken } from '../../utils/validation.js';

/**
 * Configuration for SimpleTokenResolver
 */
export interface SimpleTokenResolverConfig extends TokenResolverConfig {
  /**
   * Environment variable name containing the access token
   * @default 'ACCESS_TOKEN'
   */
  tokenEnvVar?: string;
  
  /**
   * Optional: Map of resource types to environment variable names
   * Overrides tokenEnvVar for specific resource types
   * 
   * @example
   * ```typescript
   * {
   *   instagram: 'INSTAGRAM_ACCESS_TOKEN',
   *   github: 'GITHUB_ACCESS_TOKEN'
   * }
   * ```
   */
  resourceTokenEnvVars?: Record<string, string>;
  
  /**
   * Whether to throw error if token is not found
   * @default true
   */
  throwOnMissing?: boolean;
  
  /**
   * Whether to validate token format
   * @default true
   */
  validateToken?: boolean;
}

/**
 * Simple token resolver that reads tokens from environment variables
 * 
 * This resolver is designed for single-user scenarios where authentication
 * is handled externally or not required. It reads resource-specific tokens
 * from environment variables.
 * 
 * @example
 * ```typescript
 * // Single token for all resources
 * const resolver = new SimpleTokenResolver({
 *   tokenEnvVar: 'API_TOKEN'
 * });
 * 
 * // Different tokens per resource
 * const resolver = new SimpleTokenResolver({
 *   resourceTokenEnvVars: {
 *     instagram: 'INSTAGRAM_ACCESS_TOKEN',
 *     github: 'GITHUB_ACCESS_TOKEN'
 *   }
 * });
 * ```
 */
export class SimpleTokenResolver implements ResourceTokenResolver {
  private config: Required<SimpleTokenResolverConfig>;
  private logger: Logger;
  private tokenCache: Map<string, { token: string; expiresAt: number }>;
  
  constructor(config: SimpleTokenResolverConfig = {}) {
    this.config = {
      tokenEnvVar: config.tokenEnvVar ?? 'ACCESS_TOKEN',
      resourceTokenEnvVars: config.resourceTokenEnvVars ?? {},
      throwOnMissing: config.throwOnMissing ?? true,
      validateToken: config.validateToken ?? true,
      cacheTokens: config.cacheTokens ?? true,
      cacheTtl: config.cacheTtl ?? 300000, // 5 minutes
      autoRefresh: config.autoRefresh ?? false
    };
    
    this.logger = createLogger({ enabled: true, level: 'info' });
    this.tokenCache = new Map();
  }
  
  /**
   * Resolve access token for a user and resource type
   */
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    // Check cache if enabled
    if (this.config.cacheTokens) {
      const cacheKey = `${userId}:${resourceType}`;
      const cached = this.tokenCache.get(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.debug('Token retrieved from cache', {
          userId,
          resourceType,
          cacheKey
        });
        return cached.token;
      }
    }
    
    // Determine which environment variable to use
    const envVar = this.config.resourceTokenEnvVars[resourceType]
      || `${resourceType.toUpperCase()}_ACCESS_TOKEN`;
    
    // Read token from environment
    const token = process.env[envVar];
    
    if (!token) {
      const errorMessage = `Token not found in environment variable: ${envVar}`;
      
      this.logger.warn('Token resolution failed', {
        userId,
        resourceType,
        envVar
      });
      
      if (this.config.throwOnMissing) {
        throw new TokenResolutionError(userId, resourceType, {
          envVar,
          reason: 'Environment variable not set'
        });
      }
      
      return null;
    }
    
    // Validate token format if enabled
    if (this.config.validateToken) {
      try {
        validateAccessToken(token);
      } catch (error) {
        this.logger.error('Token validation failed', error as Error, {
          userId,
          resourceType,
          envVar
        });
        
        if (this.config.throwOnMissing) {
          throw new TokenResolutionError(userId, resourceType, {
            envVar,
            reason: 'Invalid token format'
          });
        }
        
        return null;
      }
    }
    
    // Cache token if enabled
    if (this.config.cacheTokens) {
      const cacheKey = `${userId}:${resourceType}`;
      this.tokenCache.set(cacheKey, {
        token,
        expiresAt: Date.now() + this.config.cacheTtl
      });
      
      this.logger.debug('Token cached', {
        userId,
        resourceType,
        cacheKey,
        ttl: this.config.cacheTtl
      });
    }
    
    this.logger.info('Token resolved successfully', {
      userId,
      resourceType,
      envVar,
      tokenLength: token.length
    });
    
    return token;
  }
  
  /**
   * Optional: Refresh token (not supported for env-based tokens)
   */
  async refreshToken(userId: string, resourceType: string): Promise<string | null> {
    this.logger.warn('Token refresh not supported for environment-based tokens', {
      userId,
      resourceType
    });
    
    // Re-read from environment in case it changed
    return this.resolveToken(userId, resourceType);
  }
  
  /**
   * Optional: Validate token (checks if env var is set)
   */
  async validateToken(token: string, resourceType: string): Promise<boolean> {
    if (!this.config.validateToken) {
      return true;
    }
    
    try {
      validateAccessToken(token);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Optional: Initialize resolver
   */
  async initialize(): Promise<void> {
    this.logger.info('SimpleTokenResolver initialized', {
      tokenEnvVar: this.config.tokenEnvVar,
      resourceTokenEnvVars: Object.keys(this.config.resourceTokenEnvVars),
      cacheEnabled: this.config.cacheTokens
    });
    
    // Validate that at least one token is available
    const hasDefaultToken = !!process.env[this.config.tokenEnvVar];
    const hasResourceTokens = Object.values(this.config.resourceTokenEnvVars)
      .some(envVar => !!process.env[envVar]);
    
    if (!hasDefaultToken && !hasResourceTokens && this.config.throwOnMissing) {
      this.logger.warn('No tokens found in environment variables', {
        tokenEnvVar: this.config.tokenEnvVar,
        resourceTokenEnvVars: this.config.resourceTokenEnvVars
      });
    }
  }
  
  /**
   * Optional: Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.tokenCache.clear();
    this.logger.info('SimpleTokenResolver cleaned up');
  }
  
  /**
   * Clear token cache
   */
  clearCache(): void {
    this.tokenCache.clear();
    this.logger.debug('Token cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.tokenCache.size,
      keys: Array.from(this.tokenCache.keys())
    };
  }
  
  /**
   * Check if token is available for a resource type
   */
  hasToken(resourceType: string): boolean {
    const envVar = this.config.resourceTokenEnvVars[resourceType]
      || `${resourceType.toUpperCase()}_ACCESS_TOKEN`;
    
    return !!process.env[envVar];
  }
  
  /**
   * Get all available resource types
   */
  getAvailableResources(): string[] {
    const resources: string[] = [];
    
    // Check default token
    if (process.env[this.config.tokenEnvVar]) {
      resources.push('default');
    }
    
    // Check resource-specific tokens
    for (const [resourceType, envVar] of Object.entries(this.config.resourceTokenEnvVars)) {
      if (process.env[envVar]) {
        resources.push(resourceType);
      }
    }
    
    return resources;
  }
}
