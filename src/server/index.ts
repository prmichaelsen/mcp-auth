/**
 * Tool-level authentication module exports
 * 
 * Provides classes and decorators for building MCP servers with integrated authentication.
 */

// Configuration
export type { ServerConfig, NormalizedServerConfig } from './config.js';

// Server
export { AuthenticatedMCPServer } from './mcp-server.js';

// Tools
export { 
  type Tool,
  AuthenticatedTool,
  createAuthenticatedTool
} from './tool.js';

// Decorators and middleware
export {
  withAuth,
  compose,
  withLogging,
  withRateLimit,
  withTimeout,
  withRetry,
  type AuthenticatedToolHandler
} from './decorators.js';
