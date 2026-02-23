/**
 * Core type definitions for @prmichaelsen/mcp-auth
 *
 * These types are used throughout the framework for authentication,
 * request handling, and server configuration.
 */

/**
 * Transport types supported by the framework
 */
export type TransportType = 'stdio' | 'sse' | 'http';

/**
 * Progress notification parameters
 * Used for streaming progress updates during long-running operations
 */
export interface ProgressNotification {
  /**
   * Unique token identifying this progress stream
   */
  progressToken: string | number;
  
  /**
   * Current progress value (optional)
   */
  progress?: number;
  
  /**
   * Total expected value (optional)
   */
  total?: number;
  
  /**
   * Progress message/description (optional)
   */
  message?: string;
}

/**
 * Request extra parameters (from MCP SDK)
 * Contains optional metadata passed with requests
 */
export interface RequestExtra {
  /**
   * Progress token for streaming progress notifications
   */
  progressToken?: string | number;
  
  /**
   * Additional custom parameters
   */
  [key: string]: any;
}

/**
 * Request context passed to authentication providers
 * Contains information about the incoming request
 */
export interface RequestContext {
  /**
   * Request headers (for HTTP/SSE transports)
   * May contain authorization tokens, API keys, etc.
   */
  headers?: Record<string, string | string[] | undefined>;
  
  /**
   * Additional request metadata
   * Can be used to pass custom context information
   */
  metadata?: Record<string, unknown>;
  
  /**
   * Transport type of the request
   */
  transport: TransportType;
  
  /**
   * Request timestamp
   */
  timestamp: Date;
  
  /**
   * Optional: Request ID for tracing
   */
  requestId?: string;
}

/**
 * Authentication result returned by auth providers
 */
export interface AuthResult {
  /**
   * Whether authentication succeeded
   */
  authenticated: boolean;
  
  /**
   * User/tenant identifier (if authenticated)
   */
  userId?: string;
  
  /**
   * Error message (if authentication failed)
   */
  error?: string;
  
  /**
   * Additional metadata about the authentication
   * Can include user roles, permissions, etc.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Transport configuration
 */
export interface TransportConfig {
  /**
   * Transport type
   */
  type: TransportType;
  
  /**
   * Port for HTTP/SSE transports
   */
  port?: number;
  
  /**
   * Host for HTTP/SSE transports
   * @default '0.0.0.0'
   */
  host?: string;
  
  /**
   * Base path for SSE endpoint
   * @default '/mcp'
   */
  basePath?: string;
  
  /**
   * Enable CORS for HTTP/SSE transports
   *
   * ⚠️ SECURITY WARNING: When enabling CORS, you MUST specify corsOrigin.
   * Never use wildcard (*) in production environments.
   *
   * @default false
   */
  cors?: boolean;
  
  /**
   * CORS origin configuration
   *
   * Specifies which origins are allowed to access the MCP server.
   *
   * ⚠️ SECURITY REQUIREMENTS:
   * - REQUIRED when cors is enabled
   * - Wildcard (*) is ONLY allowed in development (NODE_ENV !== 'production')
   * - In production, specify explicit origins to prevent CSRF attacks
   *
   * @example Single origin
   * ```typescript
   * corsOrigin: 'https://app.example.com'
   * ```
   *
   * @example Multiple origins
   * ```typescript
   * corsOrigin: ['https://app1.example.com', 'https://app2.example.com']
   * ```
   *
   * @example Development only (INSECURE)
   * ```typescript
   * corsOrigin: '*'  // Only works when NODE_ENV !== 'production'
   * ```
   */
  corsOrigin?: string | string[];
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /**
   * Whether rate limiting is enabled
   */
  enabled: boolean;
  
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;
  
  /**
   * Time window in milliseconds
   */
  windowMs: number;
  
  /**
   * Optional: Custom key generator for rate limiting
   * By default, uses userId
   */
  keyGenerator?: (context: RequestContext, userId: string) => string;
  
  /**
   * Optional: Custom error message
   */
  message?: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /**
   * Whether logging is enabled
   */
  enabled: boolean;
  
  /**
   * Log level
   */
  level: 'debug' | 'info' | 'warn' | 'error';
  
  /**
   * Log format
   * @default 'text'
   */
  format?: 'json' | 'text';
  
  /**
   * Whether to log request/response bodies
   * @default false
   */
  logBodies?: boolean;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  /**
   * Rate limiting configuration
   */
  rateLimit?: RateLimitConfig;
  
  /**
   * Logging configuration
   */
  logging?: LoggingConfig;
}

/**
 * Server pooling configuration
 */
export interface PoolingConfig {
  /**
   * Whether server pooling is enabled
   * @default true
   */
  enabled: boolean;
  
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
   * Maximum total number of pooled servers
   * @default 100
   */
  maxTotalServers?: number;
}

/**
 * Generic result type for operations that may fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async function type
 */
export type AsyncFunction<TArgs extends any[] = any[], TReturn = any> = 
  (...args: TArgs) => Promise<TReturn>;

/**
 * Tool handler function signature
 */
export type ToolHandler<TArgs = any, TResult = any> = (
  args: TArgs,
  accessToken: string,
  userId: string
) => Promise<TResult>;

/**
 * Middleware function signature
 */
export type Middleware<TArgs = any, TResult = any> = (
  handler: ToolHandler<TArgs, TResult>
) => ToolHandler<TArgs, TResult>;
