/**
 * Configuration types for server wrapper
 * 
 * Defines configuration for wrapping MCP servers with authentication.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import type { TransportConfig, MiddlewareConfig } from '../types.js';

/**
 * MCP Server Factory Function
 * 
 * Creates a configured MCP server instance for a specific user.
 * This is the core contract that MCP servers must implement to be compatible
 * with mcp-auth server wrapping.
 * 
 * @param accessToken - Resource-specific access token (e.g., Instagram, GitHub token)
 * @param userId - Authenticated user identifier
 * @returns Configured MCP server instance
 * 
 * @example
 * ```typescript
 * export function createServer(accessToken: string, userId?: string): Server {
 *   const server = new Server({ name: 'my-server', version: '1.0.0' });
 *   const client = new MyAPIClient(accessToken);
 *   // Register handlers...
 *   return server;
 * }
 * ```
 */
export type MCPServerFactory = (
  accessToken: string,
  userId: string
) => Server | Promise<Server>;

/**
 * Server wrapper configuration
 * 
 * Configuration for wrapping an MCP server with authentication and multi-tenancy support.
 */
export interface ServerWrapperConfig {
  /**
   * Factory function that creates a server instance for a specific user
   * 
   * This function will be called for each request (ephemeral instances)
   * or reused from pool (if pooling is enabled).
   * 
   * @example
   * ```typescript
   * serverFactory: (accessToken, userId) => createInstagramServer(accessToken, userId)
   * ```
   */
  serverFactory: MCPServerFactory;
  
  /**
   * Authentication provider
   * 
   * Validates incoming requests and returns user ID.
   * 
   * @example
   * ```typescript
   * authProvider: new JWTAuthProvider({ jwtSecret: process.env.JWT_SECRET })
   * ```
   */
  authProvider: AuthProvider;
  
  /**
   * Token resolver for resource-specific tokens
   * 
   * Maps user ID to resource-specific access token (e.g., Instagram token).
   * 
   * @example
   * ```typescript
   * tokenResolver: new DatabaseTokenResolver({ database: { ... } })
   * ```
   */
  tokenResolver: ResourceTokenResolver;
  
  /**
   * Resource type identifier
   * 
   * Used to identify which resource tokens to resolve (e.g., 'instagram', 'github').
   * 
   * @example 'instagram', 'github', 'slack'
   */
  resourceType: string;
  
  /**
   * Transport configuration
   * 
   * Defines how the server communicates with clients.
   */
  transport: TransportConfig;
  
  /**
   * Optional: Server name
   * @default 'mcp-auth-wrapped-server'
   */
  name?: string;
  
  /**
   * Optional: Server version
   * @default '1.0.0'
   */
  version?: string;
  
  /**
   * Optional: Middleware configuration
   * 
   * Configure rate limiting, logging, and other middleware.
   */
  middleware?: MiddlewareConfig;
  
  /**
   * Optional: Server instance mode
   * 
   * - 'ephemeral': Create new server instance per request (recommended for security)
   * - 'pooled': Reuse server instances per user (better performance, more complexity)
   * 
   * @default 'ephemeral'
   * 
   * Note: Ephemeral mode is recommended based on security analysis.
   * See: agent/ephemeral-vs-cached-instances.md
   */
  instanceMode?: 'ephemeral' | 'pooled';
  
  /**
   * Optional: Pooling configuration (only used if instanceMode is 'pooled')
   * 
   * Note: Pooling is optional and adds complexity. Ephemeral mode is recommended.
   */
  pooling?: {
    /**
     * Maximum number of server instances per user
     * @default 1
     */
    maxServersPerUser?: number;
    
    /**
     * Idle timeout in milliseconds before cleaning up a server instance
     * @default 300000 (5 minutes)
     */
    idleTimeoutMs?: number;
    
    /**
     * Maximum total number of pooled servers across all users
     * @default 100
     */
    maxTotalServers?: number;
  };
  
  /**
   * Optional: Request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  requestTimeoutMs?: number;
  
  /**
   * Optional: Enable request tracing
   * @default false
   */
  enableTracing?: boolean;
}

/**
 * Validated and normalized server wrapper configuration
 * Used internally after validation
 */
export interface NormalizedServerWrapperConfig extends Required<Omit<ServerWrapperConfig, 'middleware' | 'pooling'>> {
  middleware: MiddlewareConfig;
  pooling: {
    maxServersPerUser: number;
    idleTimeoutMs: number;
    maxTotalServers: number;
  };
}
