/**
 * Authenticated MCP Server implementation
 * 
 * MCP server with integrated authentication for tool-level auth pattern.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolRequest
} from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig, NormalizedServerConfig } from './config.js';
import type { RequestContext, ToolHandler } from '../types.js';
import type { AuthenticatedToolHandler } from './decorators.js';
import { AuthenticatedTool, type Tool } from './tool.js';
import { ConfigurationError, TransportError } from '../utils/errors.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { validateResourceType } from '../utils/validation.js';

/**
 * Tool registration entry
 */
interface ToolRegistration {
  name: string;
  description?: string;
  inputSchema?: object;
  handler: AuthenticatedToolHandler;
}

/**
 * Authenticated MCP Server
 * 
 * MCP server with integrated authentication support.
 * Use this for building new MCP servers with tool-level authentication.
 * 
 * @example
 * ```typescript
 * const server = new AuthenticatedMCPServer({
 *   name: 'my-server',
 *   authProvider: new EnvAuthProvider(),
 *   tokenResolver: new SimpleTokenResolver({ tokenEnvVar: 'API_TOKEN' }),
 *   resourceType: 'myapi',
 *   transport: { type: 'stdio' }
 * });
 * 
 * server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
 *   const client = new APIClient(accessToken);
 *   return client.getData(args);
 * }));
 * 
 * await server.start();
 * ```
 */
export class AuthenticatedMCPServer {
  private config: NormalizedServerConfig;
  private mcpServer: Server;
  private logger: Logger;
  private tools: Map<string, ToolRegistration>;
  private isRunning: boolean = false;
  
  constructor(config: ServerConfig) {
    // Validate configuration
    this.validateConfig(config);
    
    // Normalize configuration
    this.config = this.normalizeConfig(config);
    
    // Initialize logger
    this.logger = createLogger(this.config.middleware.logging);
    
    // Initialize tools map
    this.tools = new Map();
    
    // Create MCP server
    this.mcpServer = new Server(
      {
        name: this.config.name,
        version: this.config.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    // Register MCP handlers
    this.registerMCPHandlers();
    
    this.logger.info('AuthenticatedMCPServer created', {
      name: this.config.name,
      version: this.config.version,
      resourceType: this.config.resourceType,
      transport: this.config.transport.type
    });
  }
  
  /**
   * Validate server configuration
   */
  private validateConfig(config: ServerConfig): void {
    if (!config.authProvider) {
      throw new ConfigurationError('authProvider is required');
    }
    if (!config.tokenResolver) {
      throw new ConfigurationError('tokenResolver is required');
    }
    if (!config.resourceType) {
      throw new ConfigurationError('resourceType is required');
    }
    if (!config.transport) {
      throw new ConfigurationError('transport is required');
    }
    
    validateResourceType(config.resourceType);
  }
  
  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: ServerConfig): NormalizedServerConfig {
    return {
      name: config.name ?? 'mcp-server',
      version: config.version ?? '1.0.0',
      authProvider: config.authProvider,
      tokenResolver: config.tokenResolver,
      resourceType: config.resourceType,
      transport: config.transport,
      middleware: {
        rateLimit: config.middleware?.rateLimit,
        logging: config.middleware?.logging ?? { enabled: true, level: 'info' }
      },
      requestTimeoutMs: config.requestTimeoutMs ?? 30000,
      enableTracing: config.enableTracing ?? false,
      errorHandler: config.errorHandler
    };
  }
  
  /**
   * Register MCP protocol handlers
   */
  private registerMCPHandlers(): void {
    // List tools handler
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      this.logger.debug('Listing tools', { count: tools.length });
      
      return { tools };
    });
    
    // Call tool handler
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      
      this.logger.info('Tool called', { toolName: name });
      
      const tool = this.tools.get(name);
      
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      
      // Create request context
      // Note: For stdio, we don't have headers, so context is minimal
      const context: RequestContext = {
        transport: this.config.transport.type,
        timestamp: new Date(),
        metadata: { toolName: name }
      };
      
      // Execute tool with authentication
      const result = await tool.handler(
        args,
        context,
        this.config.authProvider,
        this.config.tokenResolver,
        this.config.resourceType
      );
      
      // Return MCP-formatted response
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };
    });
  }
  
  /**
   * Register a tool with authentication
   * 
   * @param name - Tool name
   * @param handler - Authenticated tool handler
   * 
   * @example
   * ```typescript
   * server.registerTool('get_data', withAuth(async (args, accessToken, userId) => {
   *   return getData(args, accessToken);
   * }));
   * ```
   */
  registerTool<TArgs = any, TResult = any>(
    name: string,
    handler: AuthenticatedToolHandler<TArgs, TResult>,
    options?: {
      description?: string;
      inputSchema?: object;
    }
  ): void {
    if (this.tools.has(name)) {
      throw new ConfigurationError(`Tool '${name}' is already registered`);
    }
    
    this.tools.set(name, {
      name,
      description: options?.description,
      inputSchema: options?.inputSchema,
      handler
    });
    
    this.logger.debug('Tool registered', { name });
  }
  
  /**
   * Register a Tool class instance
   * 
   * @param tool - Tool or AuthenticatedTool instance
   * 
   * @example
   * ```typescript
   * server.registerToolClass(new AuthenticatedTool(new GetProfileTool()));
   * ```
   */
  registerToolClass(tool: Tool | AuthenticatedTool): void {
    const authenticatedTool = tool instanceof AuthenticatedTool 
      ? tool 
      : new AuthenticatedTool(tool);
    
    const handler: AuthenticatedToolHandler = async (args, context, authProvider, tokenResolver, resourceType) => {
      return authenticatedTool.execute(args, context, authProvider, tokenResolver, resourceType);
    };
    
    this.registerTool(authenticatedTool.name, handler, {
      description: authenticatedTool.description,
      inputSchema: authenticatedTool.inputSchema
    });
  }
  
  /**
   * Register multiple tools at once
   * 
   * @param tools - Array of Tool or AuthenticatedTool instances
   * 
   * @example
   * ```typescript
   * server.registerTools([
   *   new AuthenticatedTool(new GetProfileTool()),
   *   new AuthenticatedTool(new GetMediaTool())
   * ]);
   * ```
   */
  registerTools(tools: Array<Tool | AuthenticatedTool>): void {
    for (const tool of tools) {
      this.registerToolClass(tool);
    }
  }
  
  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new ConfigurationError('Server is already running');
    }
    
    this.logger.info('Starting authenticated MCP server');
    
    // Initialize auth provider
    if (this.config.authProvider.initialize) {
      await this.config.authProvider.initialize();
      this.logger.debug('Auth provider initialized');
    }
    
    // Initialize token resolver
    if (this.config.tokenResolver.initialize) {
      await this.config.tokenResolver.initialize();
      this.logger.debug('Token resolver initialized');
    }
    
    // Start transport
    switch (this.config.transport.type) {
      case 'stdio':
        await this.startStdioTransport();
        break;
      case 'sse':
      case 'http':
        throw new TransportError(
          'SSE/HTTP transports not yet implemented for tool-level auth. ' +
          'Use server wrapping pattern for remote transports.'
        );
      default:
        throw new TransportError(`Unsupported transport: ${this.config.transport.type}`);
    }
    
    this.isRunning = true;
    
    this.logger.info('Server started successfully', {
      name: this.config.name,
      transport: this.config.transport.type,
      toolCount: this.tools.size
    });
  }
  
  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping server');
    
    // Close MCP server
    await this.mcpServer.close();
    
    // Cleanup auth provider
    if (this.config.authProvider.cleanup) {
      await this.config.authProvider.cleanup();
    }
    
    // Cleanup token resolver
    if (this.config.tokenResolver.cleanup) {
      await this.config.tokenResolver.cleanup();
    }
    
    this.isRunning = false;
    
    this.logger.info('Server stopped');
  }
  
  /**
   * Start stdio transport
   */
  private async startStdioTransport(): Promise<void> {
    this.logger.info('Starting stdio transport');
    
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    
    this.logger.info('Stdio transport connected');
  }
  
  /**
   * Get server statistics
   */
  getStats(): {
    name: string;
    version: string;
    resourceType: string;
    transport: string;
    toolCount: number;
    isRunning: boolean;
  } {
    return {
      name: this.config.name,
      version: this.config.version,
      resourceType: this.config.resourceType,
      transport: this.config.transport.type,
      toolCount: this.tools.size,
      isRunning: this.isRunning
    };
  }
  
  /**
   * Get list of registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
