/**
 * Tool interface and wrapper for tool-level authentication
 * 
 * Provides class-based tool definitions with authentication support.
 */

import type { RequestContext } from '../types.js';
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import { AuthenticationError, TokenResolutionError } from '../utils/errors.js';
import { validateUserId, validateAccessToken } from '../utils/validation.js';

/**
 * Tool interface for class-based tools
 * 
 * Implement this interface to create structured, reusable tools.
 * 
 * @example
 * ```typescript
 * class GetProfileTool implements Tool {
 *   name = 'get_profile';
 *   description = 'Get user profile';
 *   
 *   inputSchema = {
 *     type: 'object',
 *     properties: {
 *       userId: { type: 'string' }
 *     }
 *   };
 *   
 *   async execute(args: { userId: string }, accessToken: string, userId: string) {
 *     const client = new APIClient(accessToken);
 *     return client.getProfile(args.userId);
 *   }
 * }
 * ```
 */
export interface Tool<TArgs = any, TResult = any> {
  /**
   * Tool name (must be unique within server)
   */
  name: string;
  
  /**
   * Tool description for clients
   */
  description?: string;
  
  /**
   * JSON Schema for tool input validation
   */
  inputSchema?: object;
  
  /**
   * Execute the tool with authenticated context
   * 
   * @param args - Tool arguments
   * @param accessToken - Resource-specific access token
   * @param userId - Authenticated user ID
   * @returns Tool result
   */
  execute(args: TArgs, accessToken: string, userId: string): Promise<TResult>;
}

/**
 * Authenticated tool wrapper
 * 
 * Wraps a Tool implementation with automatic authentication.
 * Handles auth provider and token resolver calls before executing the tool.
 * 
 * @example
 * ```typescript
 * const tool = new AuthenticatedTool(new GetProfileTool());
 * server.registerTool(tool);
 * ```
 */
export class AuthenticatedTool<TArgs = any, TResult = any> {
  constructor(
    private tool: Tool<TArgs, TResult>,
    private options?: {
      /**
       * Whether authentication is required
       * @default true
       */
      requiresAuth?: boolean;
    }
  ) {}
  
  /**
   * Get tool name
   */
  get name(): string {
    return this.tool.name;
  }
  
  /**
   * Get tool description
   */
  get description(): string | undefined {
    return this.tool.description;
  }
  
  /**
   * Get tool input schema
   */
  get inputSchema(): object | undefined {
    return this.tool.inputSchema;
  }
  
  /**
   * Execute tool with authentication
   * 
   * @param args - Tool arguments
   * @param context - Request context
   * @param authProvider - Authentication provider
   * @param tokenResolver - Token resolver
   * @param resourceType - Resource type
   * @returns Tool result
   */
  async execute(
    args: TArgs,
    context: RequestContext,
    authProvider: AuthProvider,
    tokenResolver: ResourceTokenResolver,
    resourceType: string
  ): Promise<TResult> {
    // Check if auth is required
    const requiresAuth = this.options?.requiresAuth ?? true;
    
    if (!requiresAuth) {
      // Execute without auth (use empty values)
      return this.tool.execute(args, '', '');
    }
    
    // 1. Authenticate request
    const authResult = await authProvider.authenticate(context);
    
    if (!authResult.authenticated || !authResult.userId) {
      throw new AuthenticationError(
        authResult.error || 'Authentication failed',
        { tool: this.tool.name }
      );
    }
    
    const userId = validateUserId(authResult.userId);
    
    // 2. Resolve resource token
    const accessToken = await tokenResolver.resolveToken(userId, resourceType);
    
    if (!accessToken) {
      throw new TokenResolutionError(userId, resourceType, {
        tool: this.tool.name
      });
    }
    
    validateAccessToken(accessToken);
    
    // 3. Execute tool
    return this.tool.execute(args, accessToken, userId);
  }
}

/**
 * Create an authenticated tool from a Tool implementation
 * 
 * Helper function for creating authenticated tools.
 * 
 * @param tool - Tool implementation
 * @param options - Authentication options
 * @returns Authenticated tool wrapper
 * 
 * @example
 * ```typescript
 * const tool = createAuthenticatedTool(new GetProfileTool());
 * server.registerTool(tool);
 * ```
 */
export function createAuthenticatedTool<TArgs = any, TResult = any>(
  tool: Tool<TArgs, TResult>,
  options?: { requiresAuth?: boolean }
): AuthenticatedTool<TArgs, TResult> {
  return new AuthenticatedTool(tool, options);
}
