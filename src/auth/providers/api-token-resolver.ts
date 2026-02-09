/**
 * API-based token resolver
 * 
 * Resolves tokens by calling the tenant manager's API.
 * Alternative to JWT-embedded tokens for better separation.
 */

import type { ResourceTokenResolver, TokenResolverConfig } from '../types.js';
import { TokenResolutionError } from '../../utils/errors.js';
import { createLogger, type Logger } from '../../utils/logger.js';
import { validateAccessToken } from '../../utils/validation.js';

/**
 * Configuration for APITokenResolver
 */
export interface APITokenResolverConfig extends TokenResolverConfig {
  /**
   * Tenant manager API base URL
   * @example 'https://tenant-manager.example.com'
   */
  tenantManagerUrl: string;
  
  /**
   * Service token for authenticating MCP server → tenant manager requests
   * This is a separate token from user JWTs
   */
  serviceToken: string;
  
  /**
   * API endpoint path template
   * @default '/api/credentials/:userId/:resourceType'
   * 
   * Variables:
   * - :userId - Will be replaced with actual user ID
   * - :resourceType - Will be replaced with resource type
   */
  endpointPath?: string;
  
  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeoutMs?: number;
  
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
  
  /**
   * Custom headers to include in API requests
   */
  customHeaders?: Record<string, string>;
}

/**
 * API token resolver
 * 
 * Resolves tokens by calling the tenant manager's API endpoint.
 * This approach provides better separation between MCP server and tenant manager.
 * 
 * @example
 * ```typescript
 * const resolver = new APITokenResolver({
 *   tenantManagerUrl: 'https://tenant-manager.example.com',
 *   serviceToken: process.env.SERVICE_TOKEN
 * });
 * 
 * // Calls: GET https://tenant-manager.example.com/api/credentials/user-123/instagram
 * // Headers: { Authorization: Bearer <service-token> }
 * // Returns: { accessToken: "IGQVJXabc..." }
 * ```
 */
export class APITokenResolver implements ResourceTokenResolver {
  private config: Required<APITokenResolverConfig>;
  private logger: Logger;
  private tokenCache: Map<string, { token: string; expiresAt: number }>;
  
  constructor(config: APITokenResolverConfig) {
    if (!config.tenantManagerUrl) {
      throw new Error('tenantManagerUrl is required for APITokenResolver');
    }
    if (!config.serviceToken) {
      throw new Error('serviceToken is required for APITokenResolver');
    }
    
    this.config = {
      tenantManagerUrl: config.tenantManagerUrl.replace(/\/$/, ''), // Remove trailing slash
      serviceToken: config.serviceToken,
      endpointPath: config.endpointPath ?? '/api/credentials/:userId/:resourceType',
      timeoutMs: config.timeoutMs ?? 5000,
      throwOnMissing: config.throwOnMissing ?? true,
      validateToken: config.validateToken ?? true,
      customHeaders: config.customHeaders ?? {},
      cacheTokens: config.cacheTokens ?? true,
      cacheTtl: config.cacheTtl ?? 300000, // 5 minutes
      autoRefresh: config.autoRefresh ?? false
    };
    
    this.logger = createLogger({ enabled: true, level: 'info' });
    this.tokenCache = new Map();
  }
  
  /**
   * Resolve token by calling tenant manager API
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
    
    // Build API URL
    const url = this.buildUrl(userId, resourceType);
    
    try {
      this.logger.debug('Calling tenant manager API', {
        userId,
        resourceType,
        url
      });
      
      // Call tenant manager API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.serviceToken}`,
          'Content-Type': 'application/json',
          ...this.config.customHeaders
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        this.logger.warn('API request failed', {
          userId,
          resourceType,
          status: response.status,
          error: errorText
        });
        
        if (this.config.throwOnMissing) {
          throw new TokenResolutionError(userId, resourceType, {
            status: response.status,
            error: errorText,
            url
          });
        }
        
        return null;
      }
      
      // Parse response
      const data = await response.json() as any;
      const token = data.accessToken || data.access_token || data.token;
      
      if (!token) {
        this.logger.warn('API response missing token', {
          userId,
          resourceType,
          responseKeys: Object.keys(data || {})
        });
        
        if (this.config.throwOnMissing) {
          throw new TokenResolutionError(userId, resourceType, {
            reason: 'API response missing accessToken field'
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
            resourceType
          });
          
          if (this.config.throwOnMissing) {
            throw new TokenResolutionError(userId, resourceType, {
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
        tokenLength: token.length
      });
      
      return token;
      
    } catch (error) {
      if (error instanceof TokenResolutionError) {
        throw error;
      }
      
      this.logger.error('API request error', error as Error, {
        userId,
        resourceType,
        url
      });
      
      if (this.config.throwOnMissing) {
        throw new TokenResolutionError(userId, resourceType, {
          reason: error instanceof Error ? error.message : 'API request failed',
          url
        });
      }
      
      return null;
    }
  }
  
  /**
   * Build API URL from template
   */
  private buildUrl(userId: string, resourceType: string): string {
    const path = this.config.endpointPath
      .replace(':userId', encodeURIComponent(userId))
      .replace(':resourceType', encodeURIComponent(resourceType));
    
    return `${this.config.tenantManagerUrl}${path}`;
  }
  
  /**
   * Refresh token (calls API again)
   */
  async refreshToken(userId: string, resourceType: string): Promise<string | null> {
    this.logger.info('Refreshing token via API', { userId, resourceType });
    
    // Clear cache and fetch fresh token
    const cacheKey = `${userId}:${resourceType}`;
    this.tokenCache.delete(cacheKey);
    
    return this.resolveToken(userId, resourceType);
  }
  
  /**
   * Validate token (basic check)
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
   * Initialize resolver
   */
  async initialize(): Promise<void> {
    this.logger.info('APITokenResolver initialized', {
      tenantManagerUrl: this.config.tenantManagerUrl,
      endpointPath: this.config.endpointPath,
      cacheEnabled: this.config.cacheTokens,
      timeoutMs: this.config.timeoutMs
    });
    
    // Validate configuration
    try {
      new URL(this.config.tenantManagerUrl);
    } catch {
      throw new Error(`Invalid tenantManagerUrl: ${this.config.tenantManagerUrl}`);
    }
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.tokenCache.clear();
    this.logger.info('APITokenResolver cleaned up');
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
}
