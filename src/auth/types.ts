/**
 * Authentication type definitions for @prmichaelsen/mcp-auth
 *
 * Defines the core interfaces for authentication providers and token resolvers.
 *
 * ## Key Concepts
 *
 * ### userId
 * The **user identifier** in your authentication system (e.g., from JWT, OAuth, API key).
 * This identifies WHO is making the request.
 *
 * Examples:
 * - JWT: Extracted from token claims (e.g., `decoded.sub` or `decoded.userId`)
 * - OAuth: User ID from OAuth provider (e.g., Google user ID)
 * - API Key: User ID associated with the API key in your database
 *
 * ### accessToken
 * The **resource-specific access token** needed to call the external API.
 * This is what the MCP server uses to authenticate with the resource (Instagram, GitHub, etc.).
 *
 * Examples:
 * - Instagram: Instagram Graph API access token
 * - GitHub: GitHub personal access token or OAuth token
 * - Slack: Slack bot token or user token
 *
 * ## Two-Step Process
 *
 * 1. **AuthProvider.authenticate()**: Request → userId
 *    - Validates the incoming request (JWT, OAuth token, API key, etc.)
 *    - Returns the userId of the authenticated user
 *
 * 2. **ResourceTokenResolver.resolveToken()**: userId + resourceType → accessToken
 *    - Looks up the resource-specific token for that user
 *    - Returns the accessToken needed to call the external API
 *
 * ## Example Flow
 *
 * ```
 * Client Request with JWT
 *   ↓
 * AuthProvider.authenticate(context)
 *   → Verifies JWT signature
 *   → Extracts userId: "user-123"
 *   ↓
 * ResourceTokenResolver.resolveToken("user-123", "instagram")
 *   → Queries database: SELECT instagram_token WHERE user_id = "user-123"
 *   → Returns accessToken: "IGQVJXabc123..."
 *   ↓
 * MCP Server creates InstagramClient(accessToken)
 *   → Makes API calls to Instagram using the token
 * ```
 */

import type { RequestContext, AuthResult } from '../types.js';

/**
 * Authentication Provider Interface
 * 
 * Implement this interface to provide custom authentication logic.
 * The provider is responsible for validating requests and identifying users/tenants.
 * 
 * @example
 * ```typescript
 * class JWTAuthProvider implements AuthProvider {
 *   async authenticate(context: RequestContext): Promise<AuthResult> {
 *     const token = context.headers?.['authorization']?.split(' ')[1];
 *     const decoded = jwt.verify(token, this.secret);
 *     return { authenticated: true, userId: decoded.userId };
 *   }
 * }
 * ```
 */
export interface AuthProvider {
  /**
   * Authenticate a request and return the user ID
   * 
   * @param context - Request context containing headers, metadata, etc.
   * @returns Authentication result with user ID if successful
   */
  authenticate(context: RequestContext): Promise<AuthResult>;
  
  /**
   * Optional: Initialize the provider (e.g., connect to database, load keys)
   * Called once when the server starts
   */
  initialize?(): Promise<void>;
  
  /**
   * Optional: Cleanup resources (e.g., close database connections)
   * Called when the server stops
   */
  cleanup?(): Promise<void>;
  
  /**
   * Optional: Validate that the provider is properly configured
   * Called during initialization
   */
  validate?(): Promise<boolean>;
}

/**
 * Resource Token Resolver Interface
 * 
 * Implement this interface to resolve resource-specific access tokens
 * (e.g., Instagram token, GitHub token, etc.) for authenticated users.
 * 
 * @example
 * ```typescript
 * class DatabaseTokenResolver implements ResourceTokenResolver {
 *   async resolveToken(userId: string, resourceType: string): Promise<string | null> {
 *     const result = await db.query(
 *       'SELECT access_token FROM credentials WHERE user_id = $1 AND resource = $2',
 *       [userId, resourceType]
 *     );
 *     return result.rows[0]?.access_token || null;
 *   }
 * }
 * ```
 */
export interface ResourceTokenResolver {
  /**
   * Resolve resource access token for a user
   * 
   * @param userId - Authenticated user ID
   * @param resourceType - Type of resource (e.g., 'instagram', 'github')
   * @returns Access token or null if not found
   */
  resolveToken(userId: string, resourceType: string): Promise<string | null>;
  
  /**
   * Optional: Refresh an expired token
   * 
   * @param userId - User ID
   * @param resourceType - Resource type
   * @returns New access token or null if refresh failed
   */
  refreshToken?(userId: string, resourceType: string): Promise<string | null>;
  
  /**
   * Optional: Validate that a token is still valid
   * 
   * @param token - Token to validate
   * @param resourceType - Resource type
   * @returns True if token is valid
   */
  validateToken?(token: string, resourceType: string): Promise<boolean>;
  
  /**
   * Optional: Initialize the resolver (e.g., connect to database)
   * Called once when the server starts
   */
  initialize?(): Promise<void>;
  
  /**
   * Optional: Cleanup resources
   * Called when the server stops
   */
  cleanup?(): Promise<void>;
}

/**
 * Combined authentication and token resolution result
 * Used internally by the framework
 */
export interface AuthenticatedContext {
  /**
   * Authenticated user ID
   */
  userId: string;
  
  /**
   * Resource-specific access token
   */
  accessToken: string;
  
  /**
   * Original request context
   */
  requestContext: RequestContext;
  
  /**
   * Additional metadata from authentication
   */
  metadata?: Record<string, unknown>;
}

/**
 * Auth provider configuration options
 */
export interface AuthProviderConfig {
  /**
   * Optional: Custom error messages
   */
  errorMessages?: {
    noAuth?: string;
    invalidAuth?: string;
    expiredAuth?: string;
  };
  
  /**
   * Optional: Whether to cache authentication results
   * @default false
   */
  cacheResults?: boolean;
  
  /**
   * Optional: Cache TTL in milliseconds
   * @default 60000 (1 minute)
   */
  cacheTtl?: number;
}

/**
 * Token resolver configuration options
 */
export interface TokenResolverConfig {
  /**
   * Optional: Whether to cache resolved tokens
   * @default true
   */
  cacheTokens?: boolean;
  
  /**
   * Optional: Token cache TTL in milliseconds
   * @default 300000 (5 minutes)
   */
  cacheTtl?: number;
  
  /**
   * Optional: Whether to automatically refresh expired tokens
   * @default false
   */
  autoRefresh?: boolean;
}
