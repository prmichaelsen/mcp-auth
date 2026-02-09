/**
 * Simple Stdio Example
 * 
 * Demonstrates the simplest use case: single-user MCP server with environment-based auth.
 */

import { 
  AuthenticatedMCPServer, 
  withAuth,
  EnvAuthProvider,
  SimpleTokenResolver
} from '@prmichaelsen/mcp-auth';

// Mock API client (replace with your actual API client)
class MockAPIClient {
  constructor(private accessToken: string) {}
  
  async getData(id: string): Promise<any> {
    return {
      id,
      data: `Mock data for ${id}`,
      accessToken: this.accessToken.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    };
  }
  
  async createItem(name: string): Promise<any> {
    return {
      id: `item-${Date.now()}`,
      name,
      created: new Date().toISOString()
    };
  }
}

// Create server with environment-based auth
const server = new AuthenticatedMCPServer({
  name: 'simple-stdio-example',
  version: '1.0.0',
  
  // Auth provider reads user ID from environment
  authProvider: new EnvAuthProvider({
    userIdEnvVar: 'MCP_USER_ID',
    defaultUserId: 'local-user'
  }),
  
  // Token resolver reads API token from environment
  tokenResolver: new SimpleTokenResolver({
    tokenEnvVar: 'API_TOKEN'
  }),
  
  resourceType: 'mock-api',
  
  // Stdio transport for local use
  transport: {
    type: 'stdio'
  }
});

// Register tools with automatic authentication
server.registerTool(
  'get_data',
  withAuth(async (args: { id: string }, accessToken, userId) => {
    const client = new MockAPIClient(accessToken);
    const result = await client.getData(args.id);
    return JSON.stringify(result, null, 2);
  }),
  {
    description: 'Get data by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Item ID to fetch'
        }
      },
      required: ['id']
    }
  }
);

server.registerTool(
  'create_item',
  withAuth(async (args: { name: string }, accessToken, userId) => {
    const client = new MockAPIClient(accessToken);
    const result = await client.createItem(args.name);
    return JSON.stringify(result, null, 2);
  }),
  {
    description: 'Create a new item',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Item name'
        }
      },
      required: ['name']
    }
  }
);

// Start server
console.log('Starting simple stdio MCP server...');
console.log('Environment:');
console.log(`  MCP_USER_ID: ${process.env.MCP_USER_ID || '(using default)'}`);
console.log(`  API_TOKEN: ${process.env.API_TOKEN ? '✓ set' : '✗ not set'}`);
console.log('');

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
