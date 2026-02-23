/**
 * @prmichaelsen/mcp-auth
 *
 * Authentication and multi-tenancy framework for MCP (Model Context Protocol) servers.
 *
 * Supports two complementary patterns:
 * 1. **Server Wrapping** - Wrap existing MCP servers without modification (MCP-level auth)
 * 2. **Tool-Level Auth** - Build new MCP servers with integrated auth
 *
 * @packageDocumentation
 */

// ============================================================================
// PATTERN 1: SERVER WRAPPING (MCP-Level Auth)
// ============================================================================
// Use this to wrap existing MCP servers without modifying them
// Ideal for multi-tenant services that host multiple MCP servers

export {
  wrapServer,
  AuthenticatedServerWrapper,
  type ServerWrapperConfig,
  type MCPServerFactory,
  type NormalizedServerWrapperConfig,
  ProgressManager,
  type ProgressCallback,
  type ProgressStreamMetrics
} from './wrapper/index.js';

// ============================================================================
// PATTERN 2: TOOL-LEVEL AUTH
// ============================================================================
// Use this to build new MCP servers with integrated authentication
// Provides fine-grained control over auth per tool

export {
  AuthenticatedMCPServer,
  type ServerConfig,
  type NormalizedServerConfig,
  withAuth,
  compose,
  withLogging,
  withRateLimit,
  withTimeout,
  withRetry,
  type Tool,
  AuthenticatedTool,
  createAuthenticatedTool,
  type AuthenticatedToolHandler
} from './server/index.js';

// ============================================================================
// SHARED: CORE TYPES
// ============================================================================

export type {
  TransportType,
  RequestContext,
  AuthResult,
  TransportConfig,
  RateLimitConfig,
  LoggingConfig,
  MiddlewareConfig,
  PoolingConfig,
  Result,
  AsyncFunction,
  ToolHandler,
  Middleware,
  ProgressNotification,
  RequestExtra
} from './types.js';

// ============================================================================
// SHARED: AUTHENTICATION
// ============================================================================

export type {
  AuthProvider,
  ResourceTokenResolver,
  AuthenticatedContext,
  AuthProviderConfig,
  TokenResolverConfig
} from './auth/types.js';

export { BaseAuthProvider } from './auth/base-provider.js';

// Providers
export {
  EnvAuthProvider,
  type EnvAuthProviderConfig,
  SimpleTokenResolver,
  type SimpleTokenResolverConfig,
  JWTAuthProvider,
  type JWTAuthProviderConfig,
  type JWTPayload,
  JWTTokenResolver,
  type JWTTokenResolverConfig,
  APITokenResolver,
  type APITokenResolverConfig
} from './auth/providers/index.js';

// ============================================================================
// TENANT MANAGER INTEGRATION
// ============================================================================
// Standard interfaces for tenant manager APIs
// Helps tenant platforms provide consistent APIs for MCP servers

export {
  type TenantAPIErrorResponse,
  type CredentialsAPIResponse,
  type CredentialsAPIHeaders,
  type TenantManagerAPI,
  TenantAPIStatusCode,
  TenantAPIErrorCode,
  createTenantAPIError,
  TenantAPIErrors
} from './tenant/index.js';

// ============================================================================
// SHARED: UTILITIES
// ============================================================================

export {
  // Errors
  MCPAuthError,
  AuthenticationError,
  TokenResolutionError,
  InvalidTokenError,
  MissingCredentialsError,
  ConfigurationError,
  RateLimitError,
  ServerPoolError,
  TransportError,
  ValidationError,
  isMCPAuthError,
  isAuthenticationError,
  isTokenResolutionError,
  isRateLimitError,
  formatErrorForClient,
  
  // Logger
  Logger,
  LogLevel,
  defaultLogger,
  createLogger,
  sanitizeForLogging,
  
  // Validation
  validateNonEmptyString,
  validateUrl,
  validatePositiveNumber,
  validatePort,
  validateEnum,
  validateObject,
  validateFunction,
  validateRequiredFields,
  validateTransportConfig,
  validateRateLimitConfig,
  validateLoggingConfig,
  validatePoolingConfig,
  sanitizeString,
  validateUserId,
  validateResourceType,
  validateAccessToken
} from './utils/index.js';

// Re-export types for convenience
export type { LogEntry } from './utils/logger.js';

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * @example Server Wrapping Pattern (MCP-Level Auth)
 * ```typescript
 * import { wrapServer, JWTAuthProvider, DatabaseTokenResolver } from '@prmichaelsen/mcp-auth';
 * import { createServer as createInstagramServer } from '@prmichaelsen/instagram-mcp';
 *
 * const wrapped = wrapServer({
 *   serverFactory: (accessToken, userId) => createInstagramServer(accessToken, userId),
 *   authProvider: new JWTAuthProvider({ jwtSecret: process.env.JWT_SECRET }),
 *   tokenResolver: new DatabaseTokenResolver({ database: {...} }),
 *   resourceType: 'instagram',
 *   transport: { type: 'sse', port: 3000 }
 * });
 *
 * await wrapped.start();
 * ```
 *
 * @example Tool-Level Auth Pattern
 * ```typescript
 * import { AuthenticatedMCPServer, withAuth, EnvAuthProvider } from '@prmichaelsen/mcp-auth';
 *
 * const server = new AuthenticatedMCPServer({
 *   name: 'my-server',
 *   authProvider: new EnvAuthProvider(),
 *   tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' }),
 *   resourceType: 'myapi',
 *   transport: { type: 'stdio' }
 * });
 *
 * server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
 *   const client = new MyAPIClient(accessToken);
 *   return client.getData(args);
 * }));
 *
 * await server.start();
 * ```
 */
