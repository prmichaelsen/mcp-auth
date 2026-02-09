/**
 * Configuration types for tool-level authentication
 * 
 * Used when building MCP servers with embedded authentication.
 */

import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import type { TransportConfig, MiddlewareConfig } from '../types.js';

/**
 * Server configuration for AuthenticatedMCPServer
 * 
 * Configuration for building MCP servers with integrated authentication.
 * This is used for the tool-level auth pattern (Pattern 2).
 */
export interface ServerConfig {
  /**
   * Server name
   * @default 'mcp-server'
   */
  name?: string;
  
  /**
   * Server version
   * @default '1.0.0'
   */
  version?: string;
  
  /**
   * Authentication provider
   * 
   * Validates incoming requests and returns user ID.
   * 
   * @example
   * ```typescript
   * authProvider: new EnvAuthProvider()
   * ```
   */
  authProvider: AuthProvider;
  
  /**
   * Token resolver for resource-specific tokens
   * 
   * Maps user ID to resource-specific access token.
   * 
   * @example
   * ```typescript
   * tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' })
   * ```
   */
  tokenResolver: ResourceTokenResolver;
  
  /**
   * Resource type identifier
   * 
   * Used to identify which resource tokens to resolve.
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
   * Optional: Middleware configuration
   * 
   * Configure rate limiting, logging, and other middleware.
   */
  middleware?: MiddlewareConfig;
  
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
  
  /**
   * Optional: Custom error handler
   */
  errorHandler?: (error: Error, context: any) => void;
}

/**
 * Normalized server configuration with defaults applied
 * Used internally after validation
 */
export interface NormalizedServerConfig extends Required<Omit<ServerConfig, 'middleware' | 'errorHandler'>> {
  middleware: MiddlewareConfig;
  errorHandler?: (error: Error, context: any) => void;
}
