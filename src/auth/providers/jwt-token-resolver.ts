/**
 * JWT token resolver
 * 
 * Resolves tokens that were extracted from JWT by JWTAuthProvider.
 * Works in conjunction with JWTAuthProvider for JWT-embedded token approach.
 */

import type { ResourceTokenResolver, TokenResolverConfig } from '../types.js';
import type { JWTAuthProvider } from './jwt-provider.js';
import { TokenResolutionError } from '../../utils/errors.js';
import { createLogger, type Logger } from '../../utils/logger.js';

/**
 * Configuration for JWTTokenResolver
 */
export interface JWTTokenResolverConfig extends TokenResolverConfig {
  /**
   * JWTAuthProvider instance that extracts tokens
   */
  authProvider: JWTAuthProvider;
  
  /**
   * Whether to throw error if token is not found
   * @default true
   */
  throwOnMissing?: boolean;
}

/**
 * JWT token resolver
 * 
 * Resolves tokens that were cached by JWTAuthProvider during authentication.
 * This is used for the JWT-embedded token approach where the JWT contains
 * all resource tokens.
 * 
 * @example
 * ```typescript
 * const authProvider = new JWTAuthProvider({
 *   jwtSecret: process.env.JWT_SECRET,
 *   extractTokens: true
 * });
 * 
 * const tokenResolver = new JWTTokenResolver({
 *   authProvider
 * });
 * 
 * // JWT structure:
 * // {
 * //   "userId": "user-123",
 * //   "tokens": {
 * //     "instagram": "IGQVJXabc...",
 * //     "github": "ghp_abc123..."
 * //   }
 * // }
 * ```
 */
export class JWTTokenResolver implements ResourceTokenResolver {
  private config: Required<JWTTokenResolverConfig>;
  private logger: Logger;
  
  constructor(config: JWTTokenResolverConfig) {
    if (!config.authProvider) {
      throw new Error('authProvider is required for JWTTokenResolver');
    }
    
    this.config = {
      authProvider: config.authProvider,
      throwOnMissing: config.throwOnMissing ?? true,
      cacheTokens: config.cacheTokens ?? true,
      cacheTtl: config.cacheTtl ?? 300000,
      autoRefresh: config.autoRefresh ?? false
    };
    
    this.logger = createLogger({ enabled: true, level: 'info' });
  }
  
  /**
   * Resolve token from JWT auth provider's cache
   */
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    // Get token from auth provider's cache
    const token = this.config.authProvider.getCachedToken(userId, resourceType);
    
    if (!token) {
      const errorMessage = `No ${resourceType} token found in JWT for user ${userId}`;
      
      this.logger.warn('Token resolution failed', {
        userId,
        resourceType,
        reason: 'Token not found in JWT cache'
      });
      
      if (this.config.throwOnMissing) {
        throw new TokenResolutionError(userId, resourceType, {
          reason: 'Token not embedded in JWT',
          hint: 'Ensure tenant manager includes tokens in JWT payload'
        });
      }
      
      return null;
    }
    
    this.logger.debug('Token resolved from JWT cache', {
      userId,
      resourceType,
      tokenLength: token.length
    });
    
    return token;
  }
  
  /**
   * Refresh token (not supported for JWT-embedded tokens)
   */
  async refreshToken(userId: string, resourceType: string): Promise<string | null> {
    this.logger.warn('Token refresh not supported for JWT-embedded tokens', {
      userId,
      resourceType,
      hint: 'User must obtain new JWT from tenant manager'
    });
    
    return null;
  }
  
  /**
   * Validate token (checks if token exists in cache)
   */
  async validateToken(token: string, resourceType: string): Promise<boolean> {
    // Basic validation - just check if token is non-empty
    return !!(token && token.length > 0);
  }
  
  /**
   * Initialize resolver
   */
  async initialize(): Promise<void> {
    this.logger.info('JWTTokenResolver initialized', {
      throwOnMissing: this.config.throwOnMissing
    });
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Token cache is managed by auth provider
    this.logger.info('JWTTokenResolver cleaned up');
  }
  
  /**
   * Get available resource types for a user
   */
  getAvailableResources(userId: string): string[] {
    const userTokens = this.config.authProvider.tokenCache.get(userId);
    return userTokens ? Array.from(userTokens.keys()) : [];
  }
  
  /**
   * Check if token is available for a user and resource
   */
  hasToken(userId: string, resourceType: string): boolean {
    return !!this.config.authProvider.getCachedToken(userId, resourceType);
  }
}
