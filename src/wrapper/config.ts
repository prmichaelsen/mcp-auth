/**
 * Configuration types for server wrapper
 * 
 * Defines configuration for wrapping MCP servers with authentication.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import type { TransportConfig, MiddlewareConfig, InstancePoolConfig, SessionConfig } from '../types.js';

/**
 * Extra context passed from the HTTP request to the server factory.
 *
 * Populated from URL query parameters on HTTP/SSE transports.
 * Consumers can use this for any request-level context — ghost mode,
 * feature flags, conversation IDs, etc.
 */
export type MCPServerFactoryExtras = Record<string, string | string[] | undefined>;

/**
 * MCP Server Factory Function
 *
 * Creates a configured MCP server instance for a specific user.
 * This is the core contract that MCP servers must implement to be compatible
 * with mcp-auth server wrapping.
 *
 * @param accessToken - Resource-specific access token (e.g., Instagram, GitHub token)
 * @param userId - Authenticated user identifier
 * @param extras - Optional request-level context from URL query parameters
 * @returns Configured MCP server instance
 *
 * @example Basic usage
 * ```typescript
 * export function createServer(accessToken: string, userId?: string): Server {
 *   const server = new Server({ name: 'my-server', version: '1.0.0' });
 *   const client = new MyAPIClient(accessToken);
 *   // Register handlers...
 *   return server;
 * }
 * ```
 *
 * @example With extras (e.g., ghost mode)
 * ```typescript
 * serverFactory: (accessToken, userId, extras) => createServer(accessToken, userId, {
 *   ghostMode: extras?.ghost_owner ? {
 *     owner_user_id: extras.ghost_owner as string,
 *     accessor_user_id: userId,
 *   } : undefined,
 * })
 * ```
 */
export type MCPServerFactory = (
  accessToken: string,
  userId: string,
  extras?: MCPServerFactoryExtras
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
   * The optional third parameter `extras` contains URL query parameters
   * from the incoming HTTP request, enabling request-level context.
   *
   * @example Basic
   * ```typescript
   * serverFactory: (accessToken, userId) => createServer(accessToken, userId)
   * ```
   *
   * @example With extras
   * ```typescript
   * serverFactory: (accessToken, userId, extras) => createServer(accessToken, userId, {
   *   ghostMode: extras?.ghost_owner ? { owner_user_id: extras.ghost_owner as string } : undefined,
   * })
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
   * Token resolver for resource-specific tokens (optional for static servers)
   *
   * Maps user ID to resource-specific access token (e.g., Instagram token).
   *
   * If not provided, the server factory will receive an empty string as the
   * accessToken parameter. This is useful for static servers that manage their
   * own data and only need the userId from JWT validation.
   *
   * @example Dynamic server (with external credentials)
   * ```typescript
   * tokenResolver: new APITokenResolver({
   *   tenantManagerUrl: process.env.TENANT_MANAGER_URL,
   *   serviceToken: process.env.SERVICE_TOKEN
   * })
   * ```
   *
   * @example Static server (no external credentials)
   * ```typescript
   * // tokenResolver omitted - static mode
   * // serverFactory will receive empty string as accessToken
   * ```
   */
  tokenResolver?: ResourceTokenResolver;
  
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
   * Optional: Session mode for HTTP/SSE transports
   *
   * - 'stateless': Each request is independent (default, current behavior)
   * - 'stateful': Sessions persist across requests, enabling MCP features
   *   that require multi-turn server-client communication (e.g., elicitation,
   *   sampling, roots)
   *
   * In stateful mode, the wrapper manages session lifecycle:
   * - POST without Mcp-Session-Id: creates a new session (initialize)
   * - POST with Mcp-Session-Id: routes to existing session
   * - GET with Mcp-Session-Id: opens SSE stream for server→client messages
   * - DELETE with Mcp-Session-Id: terminates session
   *
   * @default 'stateless'
   */
  sessionMode?: 'stateless' | 'stateful';

  /**
   * Session configuration (used when sessionMode is 'stateful')
   *
   * Configures session timeouts, limits, and lifecycle management.
   *
   * @example
   * ```typescript
   * session: {
   *   idleTimeout: 300000,   // 5 min idle timeout
   *   maxLifetime: 3600000,  // 1 hour max lifetime
   *   maxSessions: 1000      // Max 1000 concurrent sessions
   * }
   * ```
   */
  session?: SessionConfig;

  /**
   * Instance pool configuration (required when instanceMode is 'pooled')
   *
   * Configures lifecycle management for pooled server instances.
   * Enables efficient instance reuse for performance-critical applications.
   *
   * @example
   * ```typescript
   * instancePool: {
   *   maxSize: 10,              // Max 10 concurrent instances
   *   idleTimeout: 300000,      // Close after 5 min idle
   *   maxLifetime: 3600000      // Force refresh after 1 hour
   * }
   * ```
   */
  instancePool?: InstancePoolConfig;
  
  /**
   * @deprecated Use instancePool instead
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
export interface NormalizedServerWrapperConfig extends Required<Omit<ServerWrapperConfig, 'middleware' | 'pooling' | 'tokenResolver' | 'instancePool' | 'session'>> {
  tokenResolver: ResourceTokenResolver | null;
  middleware: MiddlewareConfig;
  instancePool: InstancePoolConfig | null;
  session: Required<SessionConfig>;
  pooling: {
    maxServersPerUser: number;
    idleTimeoutMs: number;
    maxTotalServers: number;
  };
}
