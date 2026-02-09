/**
 * JWT authentication provider
 * 
 * Reference implementation for JWT-based authentication.
 * Validates JWT tokens and optionally extracts embedded resource tokens.
 */

import { BaseAuthProvider } from '../base-provider.js';
import type { AuthProviderConfig } from '../types.js';
import type { RequestContext, AuthResult } from '../../types.js';
import { AuthenticationError, MissingCredentialsError, InvalidTokenError } from '../../utils/errors.js';

/**
 * JWT payload structure
 */
export interface JWTPayload {
  /**
   * User ID (standard JWT claim: 'sub' or custom 'userId')
   */
  sub?: string;
  userId?: string;
  
  /**
   * Optional: Embedded resource tokens
   * { instagram: "token1", github: "token2" }
   */
  tokens?: Record<string, string>;
  
  /**
   * Expiration time (standard JWT claim)
   */
  exp?: number;
  
  /**
   * Issued at (standard JWT claim)
   */
  iat?: number;
  
  /**
   * Additional custom claims
   */
  [key: string]: any;
}

/**
 * Configuration for JWTAuthProvider
 */
export interface JWTAuthProviderConfig extends AuthProviderConfig {
  /**
   * JWT secret for verification
   */
  jwtSecret: string;
  
  /**
   * JWT algorithm
   * @default 'HS256'
   */
  algorithm?: string;
  
  /**
   * Whether to extract embedded tokens from JWT
   * If true, tokens will be cached for JWTTokenResolver
   * @default true
   */
  extractTokens?: boolean;
  
  /**
   * Custom user ID claim name
   * @default 'sub' (falls back to 'userId')
   */
  userIdClaim?: string;
  
  /**
   * Custom tokens claim name
   * @default 'tokens'
   */
  tokensClaim?: string;
  
  /**
   * Whether to validate token expiration
   * @default true
   */
  validateExpiration?: boolean;
  
  /**
   * Clock tolerance in seconds for exp/nbf claims
   * @default 0
   */
  clockTolerance?: number;
}

/**
 * JWT authentication provider
 * 
 * Validates JWT tokens issued by the tenant manager.
 * Optionally extracts embedded resource tokens from the JWT payload.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const provider = new JWTAuthProvider({
 *   jwtSecret: process.env.JWT_SECRET
 * });
 * 
 * // With token extraction
 * const provider = new JWTAuthProvider({
 *   jwtSecret: process.env.JWT_SECRET,
 *   extractTokens: true
 * });
 * ```
 */
export class JWTAuthProvider extends BaseAuthProvider {
  private jwtConfig: Required<JWTAuthProviderConfig>;
  
  /**
   * Token cache for extracted tokens
   * Maps userId → resourceType → token
   */
  public readonly tokenCache = new Map<string, Map<string, string>>();
  
  constructor(config: JWTAuthProviderConfig) {
    super(config);
    
    if (!config.jwtSecret) {
      throw new Error('jwtSecret is required for JWTAuthProvider');
    }
    
    this.jwtConfig = {
      ...config,
      jwtSecret: config.jwtSecret,
      algorithm: config.algorithm ?? 'HS256',
      extractTokens: config.extractTokens ?? true,
      userIdClaim: config.userIdClaim ?? 'sub',
      tokensClaim: config.tokensClaim ?? 'tokens',
      validateExpiration: config.validateExpiration ?? true,
      clockTolerance: config.clockTolerance ?? 0,
      errorMessages: config.errorMessages ?? {},
      cacheResults: config.cacheResults ?? false,
      cacheTtl: config.cacheTtl ?? 60000
    };
  }
  
  /**
   * Authenticate request by validating JWT
   */
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    // Extract bearer token
    const token = this.extractBearerToken(context);
    
    if (!token) {
      return this.createFailureResult(
        this.jwtConfig.errorMessages?.noAuth || 'No JWT token provided'
      );
    }
    
    try {
      // Dynamically import jsonwebtoken (optional dependency)
      // @ts-ignore - Dynamic import of optional dependency
      const jwt = await import('jsonwebtoken');
      
      // Verify JWT
      const decoded = jwt.verify(token, this.jwtConfig.jwtSecret, {
        algorithms: [this.jwtConfig.algorithm as any],
        clockTolerance: this.jwtConfig.clockTolerance
      }) as JWTPayload;
      
      // Extract user ID
      const userId = decoded[this.jwtConfig.userIdClaim] || decoded.userId || decoded.sub;
      
      if (!userId) {
        return this.createFailureResult('JWT does not contain user ID');
      }
      
      this.logger.debug('JWT validated successfully', {
        userId,
        hasTokens: !!decoded[this.jwtConfig.tokensClaim]
      });
      
      // Extract embedded tokens if enabled
      if (this.jwtConfig.extractTokens && decoded[this.jwtConfig.tokensClaim]) {
        const tokens = decoded[this.jwtConfig.tokensClaim] as Record<string, string>;
        
        // Cache tokens for resolver
        const userTokens = new Map<string, string>();
        for (const [resourceType, resourceToken] of Object.entries(tokens)) {
          userTokens.set(resourceType, resourceToken);
        }
        this.tokenCache.set(userId, userTokens);
        
        this.logger.debug('Extracted tokens from JWT', {
          userId,
          resourceTypes: Object.keys(tokens)
        });
      }
      
      return this.createSuccessResult(userId, {
        exp: decoded.exp,
        iat: decoded.iat,
        hasEmbeddedTokens: !!decoded[this.jwtConfig.tokensClaim]
      });
      
    } catch (error) {
      this.logger.warn('JWT validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          return this.createFailureResult(
            this.jwtConfig.errorMessages?.expiredAuth || 'JWT token has expired'
          );
        }
        if (error.message.includes('invalid')) {
          return this.createFailureResult(
            this.jwtConfig.errorMessages?.invalidAuth || 'Invalid JWT token'
          );
        }
      }
      
      return this.createFailureResult('JWT validation failed');
    }
  }
  
  /**
   * Validate provider configuration
   */
  async validate(): Promise<boolean> {
    if (!this.jwtConfig.jwtSecret || this.jwtConfig.jwtSecret.length < 32) {
      this.logger.error('JWT secret must be at least 32 characters');
      return false;
    }
    
    // Try to import jsonwebtoken
    try {
      // @ts-ignore - Dynamic import of optional dependency
      await import('jsonwebtoken');
    } catch {
      this.logger.error('jsonwebtoken package is required. Install it with: npm install jsonwebtoken');
      return false;
    }
    
    return true;
  }
  
  /**
   * Get cached token for a user and resource
   */
  getCachedToken(userId: string, resourceType: string): string | null {
    return this.tokenCache.get(userId)?.get(resourceType) || null;
  }
  
  /**
   * Clear token cache
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
    this.logger.debug('Token cache cleared');
  }
  
  /**
   * Get token cache statistics
   */
  getTokenCacheStats(): {
    userCount: number;
    totalTokens: number;
    users: Array<{ userId: string; resourceTypes: string[] }>;
  } {
    const users = Array.from(this.tokenCache.entries()).map(([userId, tokens]) => ({
      userId,
      resourceTypes: Array.from(tokens.keys())
    }));
    
    const totalTokens = users.reduce((sum, user) => sum + user.resourceTypes.length, 0);
    
    return {
      userCount: this.tokenCache.size,
      totalTokens,
      users
    };
  }
}
