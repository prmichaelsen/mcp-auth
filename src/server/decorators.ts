/**
 * Decorators and middleware for tool-level authentication
 * 
 * Provides function wrappers for adding authentication to tool handlers.
 */

import type { ToolHandler, Middleware, RequestContext } from '../types.js';
import type { AuthProvider, ResourceTokenResolver } from '../auth/types.js';
import { AuthenticationError, TokenResolutionError } from '../utils/errors.js';
import { validateUserId, validateAccessToken } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ enabled: true, level: 'info' });

/**
 * Authenticated tool handler type
 * Internal type used by the framework
 */
export type AuthenticatedToolHandler<TArgs = any, TResult = any> = (
  args: TArgs,
  context: RequestContext,
  authProvider: AuthProvider,
  tokenResolver: ResourceTokenResolver,
  resourceType: string
) => Promise<TResult>;

/**
 * Wrap a tool handler with authentication
 * 
 * This is the primary decorator for adding authentication to function-based tools.
 * It automatically handles authentication and token resolution before calling your handler.
 * 
 * @param handler - Tool handler function that receives (args, accessToken, userId)
 * @returns Authenticated tool handler
 * 
 * @example
 * ```typescript
 * const getTool = withAuth(async (args, accessToken, userId) => {
 *   const client = new APIClient(accessToken);
 *   return client.getData(args);
 * });
 * 
 * server.registerTool('get_data', getTool);
 * ```
 */
export function withAuth<TArgs = any, TResult = any>(
  handler: ToolHandler<TArgs, TResult>
): AuthenticatedToolHandler<TArgs, TResult> {
  return async (
    args: TArgs,
    context: RequestContext,
    authProvider: AuthProvider,
    tokenResolver: ResourceTokenResolver,
    resourceType: string
  ): Promise<TResult> => {
    // 1. Authenticate request
    const authResult = await authProvider.authenticate(context);
    
    if (!authResult.authenticated || !authResult.userId) {
      throw new AuthenticationError(
        authResult.error || 'Authentication failed'
      );
    }
    
    const userId = validateUserId(authResult.userId);
    
    logger.debug('Request authenticated', { userId, resourceType });
    
    // 2. Resolve resource token
    const accessToken = await tokenResolver.resolveToken(userId, resourceType);
    
    if (!accessToken) {
      throw new TokenResolutionError(userId, resourceType);
    }
    
    validateAccessToken(accessToken);
    
    logger.debug('Token resolved', { userId, resourceType });
    
    // 3. Call handler with authenticated context
    return handler(args, accessToken, userId);
  };
}

/**
 * Compose multiple middleware functions
 * 
 * Applies middleware in order from left to right.
 * Each middleware wraps the next one in the chain.
 * 
 * @param middlewares - Middleware functions to compose
 * @returns Composed middleware function
 * 
 * @example
 * ```typescript
 * const tool = compose(
 *   withLogging(),
 *   withRateLimit({ maxRequests: 10 }),
 *   withAuth(),
 *   handler
 * );
 * ```
 */
export function compose<TArgs = any, TResult = any>(
  ...middlewares: Array<Middleware<TArgs, TResult> | ToolHandler<TArgs, TResult>>
): ToolHandler<TArgs, TResult> {
  if (middlewares.length === 0) {
    throw new Error('compose() requires at least one argument');
  }
  
  // Last item should be the handler
  const handler = middlewares[middlewares.length - 1] as ToolHandler<TArgs, TResult>;
  const mws = middlewares.slice(0, -1) as Middleware<TArgs, TResult>[];
  
  // Apply middleware from right to left
  return mws.reduceRight(
    (acc, middleware) => middleware(acc),
    handler
  );
}

/**
 * Create a logging middleware
 * 
 * Logs tool execution with timing information.
 * 
 * @param options - Logging options
 * @returns Logging middleware
 * 
 * @example
 * ```typescript
 * const tool = compose(
 *   withLogging({ logArgs: true }),
 *   withAuth(),
 *   handler
 * );
 * ```
 */
export function withLogging(options?: {
  logArgs?: boolean;
  logResult?: boolean;
}): Middleware {
  const opts = {
    logArgs: options?.logArgs ?? false,
    logResult: options?.logResult ?? false
  };
  
  return (handler: ToolHandler) => {
    return async (args: any, accessToken: string, userId: string) => {
      const startTime = Date.now();
      
      logger.info('Tool execution started', {
        userId,
        ...(opts.logArgs && { args })
      });
      
      try {
        const result = await handler(args, accessToken, userId);
        const duration = Date.now() - startTime;
        
        logger.info('Tool execution completed', {
          userId,
          duration,
          ...(opts.logResult && { result })
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('Tool execution failed', error as Error, {
          userId,
          duration
        });
        
        throw error;
      }
    };
  };
}

/**
 * Create a rate limiting middleware
 * 
 * Limits the number of requests per user in a time window.
 * 
 * @param config - Rate limit configuration
 * @returns Rate limiting middleware
 * 
 * @example
 * ```typescript
 * const tool = compose(
 *   withRateLimit({ maxRequests: 10, windowMs: 60000 }),
 *   withAuth(),
 *   handler
 * );
 * ```
 */
export function withRateLimit(config: {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (userId: string) => string;
}): Middleware {
  // Simple in-memory rate limiter
  const requests = new Map<string, number[]>();
  
  return (handler: ToolHandler) => {
    return async (args: any, accessToken: string, userId: string) => {
      const key = config.keyGenerator ? config.keyGenerator(userId) : userId;
      const now = Date.now();
      
      // Get request timestamps for this key
      const timestamps = requests.get(key) || [];
      
      // Remove timestamps outside the window
      const validTimestamps = timestamps.filter(t => now - t < config.windowMs);
      
      // Check if limit exceeded
      if (validTimestamps.length >= config.maxRequests) {
        const oldestTimestamp = Math.min(...validTimestamps);
        const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          userId,
          key,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
          retryAfter
        });
        
        const error = new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
        (error as any).code = 'RATE_LIMIT_EXCEEDED';
        (error as any).retryAfter = retryAfter;
        throw error;
      }
      
      // Add current timestamp
      validTimestamps.push(now);
      requests.set(key, validTimestamps);
      
      // Execute handler
      return handler(args, accessToken, userId);
    };
  };
}

/**
 * Create a timeout middleware
 * 
 * Adds timeout to tool execution.
 * 
 * @param timeoutMs - Timeout in milliseconds
 * @returns Timeout middleware
 * 
 * @example
 * ```typescript
 * const tool = compose(
 *   withTimeout(5000), // 5 second timeout
 *   withAuth(),
 *   handler
 * );
 * ```
 */
export function withTimeout(timeoutMs: number): Middleware {
  return (handler: ToolHandler) => {
    return async (args: any, accessToken: string, userId: string) => {
      return Promise.race([
        handler(args, accessToken, userId),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tool execution timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]);
    };
  };
}

/**
 * Create a retry middleware
 * 
 * Retries tool execution on failure.
 * 
 * @param options - Retry options
 * @returns Retry middleware
 * 
 * @example
 * ```typescript
 * const tool = compose(
 *   withRetry({ maxAttempts: 3, delayMs: 1000 }),
 *   withAuth(),
 *   handler
 * );
 * ```
 */
export function withRetry(options: {
  maxAttempts: number;
  delayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}): Middleware {
  const opts = {
    maxAttempts: options.maxAttempts,
    delayMs: options.delayMs ?? 1000,
    shouldRetry: options.shouldRetry ?? (() => true)
  };
  
  return (handler: ToolHandler) => {
    return async (args: any, accessToken: string, userId: string) => {
      let lastError: Error | undefined;
      
      for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
          return await handler(args, accessToken, userId);
        } catch (error) {
          lastError = error as Error;
          
          if (attempt < opts.maxAttempts && opts.shouldRetry(lastError)) {
            logger.warn('Tool execution failed, retrying', {
              userId,
              attempt,
              maxAttempts: opts.maxAttempts,
              error: lastError.message
            });
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, opts.delayMs));
          } else {
            break;
          }
        }
      }
      
      throw lastError;
    };
  };
}
