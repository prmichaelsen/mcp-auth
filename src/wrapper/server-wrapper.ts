/**
 * Authenticated server wrapper implementation
 *
 * Wraps MCP servers with authentication and multi-tenancy support.
 * Uses ephemeral instances by default for security.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerWrapperConfig, NormalizedServerWrapperConfig } from './config.js';
import type { RequestContext } from '../types.js';
import { 
  AuthenticationError, 
  TokenResolutionError,
  ConfigurationError,
  TransportError
} from '../utils/errors.js';
import { createLogger, type Logger } from '../utils/logger.js';
import {
  validateRequiredFields,
  validateResourceType,
  validateUserId,
  validateAccessToken,
  validateTransportConfig
} from '../utils/validation.js';

/**
 * Server instance metadata (for pooled mode)
 */
interface ServerInstance {
  server: Server;
  accessToken: string;
  userId: string;
  createdAt: number;
  lastUsed: number;
}

/**
 * Authenticated server wrapper
 * 
 * Wraps an MCP server with authentication, automatically handling:
 * - Request authentication via AuthProvider
 * - Token resolution via ResourceTokenResolver
 * - Per-user server instance creation (ephemeral or pooled)
 * - Transport management (stdio, SSE, HTTP)
 * 
 * @example
 * ```typescript
 * const wrapper = new AuthenticatedServerWrapper({
 *   serverFactory: (accessToken, userId) => createInstagramServer(accessToken),
 *   authProvider: new JWTAuthProvider({ ... }),
 *   tokenResolver: new DatabaseTokenResolver({ ... }),
 *   resourceType: 'instagram',
 *   transport: { type: 'sse', port: 3000 }
 * });
 * 
 * await wrapper.start();
 * ```
 */
export class AuthenticatedServerWrapper {
  private config: NormalizedServerWrapperConfig;
  private logger: Logger;
  private serverPool: Map<string, ServerInstance>;
  private isRunning: boolean = false;
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(config: ServerWrapperConfig) {
    // Validate configuration
    this.validateConfig(config);
    
    // Normalize configuration with defaults
    this.config = this.normalizeConfig(config);
    
    // Initialize logger
    this.logger = createLogger(this.config.middleware.logging);
    
    // Initialize server pool (only used in pooled mode)
    this.serverPool = new Map();
    
    this.logger.info('AuthenticatedServerWrapper created', {
      name: this.config.name,
      resourceType: this.config.resourceType,
      transport: this.config.transport.type,
      instanceMode: this.config.instanceMode
    });
  }
  
  /**
   * Validate wrapper configuration
   */
  private validateConfig(config: ServerWrapperConfig): void {
    // Validate required fields manually for better type safety
    if (!config.serverFactory) {
      throw new ConfigurationError('serverFactory is required');
    }
    if (!config.authProvider) {
      throw new ConfigurationError('authProvider is required');
    }
    // tokenResolver is now optional for static servers
    if (!config.resourceType) {
      throw new ConfigurationError('resourceType is required');
    }
    if (!config.transport) {
      throw new ConfigurationError('transport is required');
    }
    
    validateResourceType(config.resourceType);
    validateTransportConfig(config.transport);
    
    // Log mode based on tokenResolver presence
    if (config.tokenResolver) {
      this.logger?.info('Token resolver configured - dynamic mode', {
        resolverType: config.tokenResolver.constructor.name
      });
    } else {
      this.logger?.info('No token resolver - static mode', {
        note: 'Server factory will receive empty string as accessToken'
      });
    }
  }
  
  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: ServerWrapperConfig): NormalizedServerWrapperConfig {
    return {
      serverFactory: config.serverFactory,
      authProvider: config.authProvider,
      tokenResolver: config.tokenResolver ?? null,  // Convert undefined to null
      resourceType: config.resourceType,
      transport: config.transport,
      name: config.name ?? 'mcp-auth-wrapped-server',
      version: config.version ?? '1.0.0',
      instanceMode: config.instanceMode ?? 'ephemeral',
      middleware: {
        rateLimit: config.middleware?.rateLimit,
        logging: config.middleware?.logging ?? { enabled: true, level: 'info' }
      },
      pooling: {
        maxServersPerUser: config.pooling?.maxServersPerUser ?? 1,
        idleTimeoutMs: config.pooling?.idleTimeoutMs ?? 300000,
        maxTotalServers: config.pooling?.maxTotalServers ?? 100
      },
      requestTimeoutMs: config.requestTimeoutMs ?? 30000,
      enableTracing: config.enableTracing ?? false
    };
  }
  
  /**
   * Start the wrapped server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new ConfigurationError('Server is already running');
    }
    
    this.logger.info('Starting authenticated server wrapper', {
      name: this.config.name,
      transport: this.config.transport.type
    });
    
    // Initialize auth provider
    if (this.config.authProvider.initialize) {
      await this.config.authProvider.initialize();
      this.logger.debug('Auth provider initialized');
    }
    
    // Initialize token resolver (if configured)
    if (this.config.tokenResolver) {
      if (this.config.tokenResolver.initialize) {
        await this.config.tokenResolver.initialize();
        this.logger.debug('Token resolver initialized');
      }
    } else {
      this.logger.debug('Static mode - no token resolver to initialize');
    }
    
    // Start appropriate transport
    switch (this.config.transport.type) {
      case 'stdio':
        await this.startStdioTransport();
        break;
      case 'sse':
        await this.startSSETransport();
        break;
      case 'http':
        await this.startHTTPTransport();
        break;
      default:
        throw new TransportError(`Unsupported transport type: ${this.config.transport.type}`);
    }
    
    this.isRunning = true;
    
    this.logger.info('Server wrapper started successfully', {
      name: this.config.name,
      transport: this.config.transport.type,
      port: this.config.transport.port
    });
  }
  
  /**
   * Stop the wrapped server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping server wrapper');
    
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Close all pooled servers
    if (this.config.instanceMode === 'pooled') {
      for (const [userId, instance] of this.serverPool.entries()) {
        try {
          await instance.server.close();
          this.logger.debug('Closed pooled server instance', { userId });
        } catch (error) {
          this.logger.error('Error closing server instance', error as Error, { userId });
        }
      }
      this.serverPool.clear();
    }
    
    // Cleanup auth provider
    if (this.config.authProvider.cleanup) {
      await this.config.authProvider.cleanup();
      this.logger.debug('Auth provider cleaned up');
    }
    
    // Cleanup token resolver (if configured)
    if (this.config.tokenResolver) {
      if (this.config.tokenResolver.cleanup) {
        await this.config.tokenResolver.cleanup();
        this.logger.debug('Token resolver cleaned up');
      }
    }
    
    this.isRunning = false;
    
    this.logger.info('Server wrapper stopped');
  }
  
  /**
   * Handle SSE request with direct Express req/res access
   * This allows us to use StreamableHTTPServerTransport properly
   */
  private async handleSSERequest(req: any, res: any, context: RequestContext): Promise<void> {
    const requestLogger = this.logger.child({ requestId: context.requestId });
    
    try {
      // 1. Authenticate
      requestLogger.debug('Authenticating request');
      const authResult = await this.config.authProvider.authenticate(context);
      
      if (!authResult.authenticated || !authResult.userId) {
        requestLogger.warn('Authentication failed', { error: authResult.error });
        throw new AuthenticationError(authResult.error || 'Authentication failed');
      }
      
      const userId = validateUserId(authResult.userId);
      requestLogger.debug('Authentication successful', { userId });
      
      // 2. Resolve resource token (or use empty string for static mode)
      let accessToken: string;
      
      if (this.config.tokenResolver) {
        // Dynamic mode - resolve token from external source
        const resolvedToken = await this.config.tokenResolver.resolveToken(
          userId,
          this.config.resourceType
        );
        
        if (!resolvedToken) {
          requestLogger.warn('Token resolution failed', { userId, resourceType: this.config.resourceType });
          throw new TokenResolutionError(userId, this.config.resourceType);
        }
        
        validateAccessToken(resolvedToken);
        accessToken = resolvedToken;
        requestLogger.debug('Token resolved', { userId, resourceType: this.config.resourceType });
      } else {
        // Static mode - no external token needed
        accessToken = '';
        requestLogger.debug('Static mode - no token resolution', { userId, mode: 'static' });
      }
      
      // 3. Get server instance
      const server = await this.getServerInstance(userId, accessToken);
      
      // 4. Forward request to server via StreamableHTTPServerTransport
      requestLogger.debug('Forwarding request to MCP server', { userId });
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined // Stateless mode
      });
      
      // Connect server to transport
      await server.connect(transport);
      
      // Forward the request through the transport
      // The transport handles JSON-RPC formatting
      // Tool names are passed through unchanged
      await transport.handleRequest(req, res, req.body);
      
      requestLogger.info('Request handled successfully', {
        userId,
        resourceType: this.config.resourceType
      });
      
    } catch (error) {
      requestLogger.error('SSE request handling failed', error as Error);
      throw error;
    }
  }
  
  /**
   * Get server instance (ephemeral or from pool)
   */
  private async getServerInstance(userId: string, accessToken: string): Promise<Server> {
    if (this.config.instanceMode === 'ephemeral') {
      // Create new server instance for each request (recommended)
      this.logger.debug('Creating ephemeral server instance', { userId });
      return await this.config.serverFactory(accessToken, userId);
    }
    
    // Pooled mode
    return await this.getPooledServerInstance(userId, accessToken);
  }
  
  /**
   * Get or create pooled server instance
   */
  private async getPooledServerInstance(userId: string, accessToken: string): Promise<Server> {
    // Check if we have a cached server instance
    if (this.serverPool.has(userId)) {
      const instance = this.serverPool.get(userId)!;
      
      // Check if token changed (user rotated token)
      if (instance.accessToken !== accessToken) {
        this.logger.info('Token changed, recreating server instance', { userId });
        await instance.server.close();
        this.serverPool.delete(userId);
      } else {
        // Reuse existing instance
        instance.lastUsed = Date.now();
        this.logger.debug('Reusing pooled server instance', { userId });
        return instance.server;
      }
    }
    
    // Check pool size limit
    if (this.serverPool.size >= this.config.pooling.maxTotalServers) {
      this.logger.warn('Server pool limit reached, evicting oldest instance', {
        poolSize: this.serverPool.size,
        maxTotal: this.config.pooling.maxTotalServers
      });
      await this.evictOldestInstance();
    }
    
    // Create new server instance
    this.logger.info('Creating new pooled server instance', { userId });
    const server = await this.config.serverFactory(accessToken, userId);
    
    // Add to pool
    this.serverPool.set(userId, {
      server,
      accessToken,
      userId,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
    
    // Schedule cleanup if not already scheduled
    if (!this.cleanupTimer) {
      this.scheduleCleanup();
    }
    
    return server;
  }
  
  /**
   * Evict oldest server instance from pool
   */
  private async evictOldestInstance(): Promise<void> {
    let oldestUserId: string | null = null;
    let oldestTime = Infinity;
    
    for (const [userId, instance] of this.serverPool.entries()) {
      if (instance.lastUsed < oldestTime) {
        oldestTime = instance.lastUsed;
        oldestUserId = userId;
      }
    }
    
    if (oldestUserId) {
      const instance = this.serverPool.get(oldestUserId)!;
      await instance.server.close();
      this.serverPool.delete(oldestUserId);
      
      this.logger.debug('Evicted oldest server instance', {
        userId: oldestUserId,
        age: Date.now() - instance.createdAt
      });
    }
  }
  
  /**
   * Schedule cleanup of idle server instances
   */
  private scheduleCleanup(): void {
    const timeout = this.config.pooling.idleTimeoutMs;
    
    this.cleanupTimer = setTimeout(async () => {
      const now = Date.now();
      const toRemove: string[] = [];
      
      for (const [userId, instance] of this.serverPool.entries()) {
        if (now - instance.lastUsed > timeout) {
          toRemove.push(userId);
        }
      }
      
      for (const userId of toRemove) {
        const instance = this.serverPool.get(userId)!;
        try {
          await instance.server.close();
          this.serverPool.delete(userId);
          
          this.logger.debug('Cleaned up idle server instance', {
            userId,
            idleTime: now - instance.lastUsed
          });
        } catch (error) {
          this.logger.error('Error cleaning up server instance', error as Error, { userId });
        }
      }
      
      // Reschedule if pool is not empty
      if (this.serverPool.size > 0) {
        this.scheduleCleanup();
      } else {
        this.cleanupTimer = undefined;
      }
    }, timeout);
  }
  
  /**
   * Start stdio transport (single-user mode)
   */
  private async startStdioTransport(): Promise<void> {
    this.logger.info('Starting stdio transport');
    
    // For stdio, we use environment variable for token
    const envVar = `${this.config.resourceType.toUpperCase()}_ACCESS_TOKEN`;
    const accessToken = process.env[envVar];
    
    if (!accessToken) {
      throw new ConfigurationError(
        `${envVar} environment variable required for stdio mode`
      );
    }
    
    const userId = 'stdio-user';
    
    // Create server instance
    const server = await this.config.serverFactory(accessToken, userId);
    
    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    this.logger.info('Stdio transport started', { userId });
  }
  
  /**
   * Start SSE transport (multi-user mode)
   */
  private async startSSETransport(): Promise<void> {
    this.logger.info('Starting SSE transport', {
      port: this.config.transport.port,
      basePath: this.config.transport.basePath
    });
    
    // Import express dynamically (optional dependency)
    // @ts-ignore - Dynamic import of optional dependency
    const express = await import('express');
    const app = express.default();
    
    // Enable JSON parsing
    app.use(express.json());
    
    // Enable CORS if configured
    if (this.config.transport.cors) {
      // Validate CORS configuration
      if (!this.config.transport.corsOrigin) {
        throw new ConfigurationError(
          'CORS origin must be explicitly configured when CORS is enabled. ' +
          'Set transport.corsOrigin to a specific origin (e.g., "https://app.example.com") ' +
          'or an array of allowed origins.'
        );
      }
      
      // Check for wildcard in production
      if (this.config.transport.corsOrigin === '*') {
        const isProduction = process.env.NODE_ENV === 'production';
        
        if (isProduction) {
          throw new ConfigurationError(
            'CORS wildcard (*) is not allowed in production environments. ' +
            'Specify explicit origins to prevent CSRF attacks. ' +
            'Example: corsOrigin: "https://app.example.com"'
          );
        }
        
        this.logger.warn(
          'CORS wildcard (*) detected in development. ' +
          'This is insecure and should never be used in production.',
          { corsOrigin: this.config.transport.corsOrigin }
        );
      }
      
      // @ts-ignore - Dynamic import of optional dependency
      const cors = await import('cors');
      app.use(cors.default({
        origin: this.config.transport.corsOrigin,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        exposedHeaders: ['X-Request-ID'],
        maxAge: 86400 // 24 hours
      }));
      
      this.logger.info('CORS enabled', {
        origin: this.config.transport.corsOrigin,
        credentials: true
      });
    }
    
    const basePath = this.config.transport.basePath || '/mcp';
    
    // Root endpoint info
    app.get(basePath, (req: any, res: any) => {
      res.json({
        name: this.config.name,
        version: this.config.version,
        resourceType: this.config.resourceType,
        endpoints: {
          message: `POST ${basePath}/message`,
          health: `GET ${basePath}/health`
        },
        documentation: 'https://github.com/prmichaelsen/mcp-auth'
      });
    });
    
    // SSE endpoint for MCP messages
    app.post(`${basePath}/message`, async (req: any, res: any) => {
      try {
        const context: RequestContext = {
          headers: req.headers as Record<string, string>,
          transport: 'sse',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string | undefined
        };
        
        // Handle request and forward to MCP server via transport
        await this.handleSSERequest(req, res, context);
        
      } catch (error) {
        this.logger.error('SSE request failed', error as Error);
        
        if (error instanceof AuthenticationError || error instanceof TokenResolutionError) {
          res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        } else {
          res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
          });
        }
      }
    });
    
    // Health check endpoint
    app.get(`${basePath}/health`, (req: any, res: any) => {
      res.json({
        status: 'healthy',
        name: this.config.name,
        version: this.config.version,
        resourceType: this.config.resourceType,
        instanceMode: this.config.instanceMode,
        poolSize: this.serverPool.size
      });
    });
    
    // Start server
    const port = this.config.transport.port || 3000;
    const host = this.config.transport.host || '0.0.0.0';
    
    await new Promise<void>((resolve) => {
      app.listen(port, host, () => {
        this.logger.info('SSE transport listening', {
          host,
          port,
          basePath,
          url: `http://${host}:${port}${basePath}`
        });
        resolve();
      });
    });
  }
  
  /**
   * Start HTTP transport (multi-user mode)
   */
  private async startHTTPTransport(): Promise<void> {
    this.logger.info('Starting HTTP transport', {
      port: this.config.transport.port
    });
    
    // HTTP transport is similar to SSE but with different endpoint structure
    // For now, delegate to SSE implementation
    await this.startSSETransport();
  }
  
  /**
   * Get server pool statistics
   */
  getPoolStats(): {
    size: number;
    instances: Array<{
      userId: string;
      createdAt: number;
      lastUsed: number;
      age: number;
      idleTime: number;
    }>;
  } {
    const now = Date.now();
    const instances = Array.from(this.serverPool.entries()).map(([userId, instance]) => ({
      userId,
      createdAt: instance.createdAt,
      lastUsed: instance.lastUsed,
      age: now - instance.createdAt,
      idleTime: now - instance.lastUsed
    }));
    
    return {
      size: this.serverPool.size,
      instances
    };
  }
  
  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}
