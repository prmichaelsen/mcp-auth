/**
 * Server wrapper module exports
 * 
 * Provides the main wrapServer() function for wrapping MCP servers with authentication.
 */

import { AuthenticatedServerWrapper } from './server-wrapper.js';
import type { ServerWrapperConfig, MCPServerFactory } from './config.js';

// Export types
export type { ServerWrapperConfig, MCPServerFactory, NormalizedServerWrapperConfig } from './config.js';

// Export wrapper class
export { AuthenticatedServerWrapper } from './server-wrapper.js';

/**
 * Wrap an MCP server with authentication and multi-tenancy support
 * 
 * This is the main entry point for the server wrapping pattern.
 * It creates an authenticated wrapper around your MCP server factory function.
 * 
 * @param config - Server wrapper configuration
 * @returns Authenticated server wrapper instance
 * 
 * @example
 * ```typescript
 * import { wrapServer } from '@prmichaelsen/mcp-auth';
 * import { createServer } from '@myorg/my-mcp-server';
 * 
 * const wrapped = wrapServer({
 *   serverFactory: (accessToken, userId) => createServer(accessToken, userId),
 *   authProvider: new JWTAuthProvider({ ... }),
 *   tokenResolver: new DatabaseTokenResolver({ ... }),
 *   resourceType: 'myapi',
 *   transport: { type: 'sse', port: 3000 }
 * });
 * 
 * await wrapped.start();
 * ```
 */
export function wrapServer(config: ServerWrapperConfig): AuthenticatedServerWrapper {
  return new AuthenticatedServerWrapper(config);
}
