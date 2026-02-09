/**
 * Mock MCP Server
 * 
 * Demonstrates the MCP server contract for compatibility with mcp-auth.
 * This server exports a createServer() function that accepts an accessToken.
 * 
 * Replace this with your actual MCP server (Instagram, GitHub, etc.)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolRequest
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Mock API client (replace with your actual API client)
 */
class MockAPIClient {
  constructor(private accessToken: string) {}
  
  async getData(id: string): Promise<any> {
    // Simulate API call
    return {
      id,
      data: `Mock data for ${id}`,
      accessToken: this.accessToken.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    };
  }
  
  async listItems(): Promise<any> {
    return {
      items: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' }
      ],
      total: 3
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

/**
 * Create MCP server instance
 * 
 * This is the contract that mcp-auth expects:
 * - Function name: createServer
 * - Parameters: (accessToken: string, userId?: string)
 * - Returns: Server instance
 * 
 * @param accessToken - Resource-specific access token
 * @param userId - Optional user identifier for logging
 * @returns Configured MCP server instance
 */
export function createMockServer(accessToken: string, userId?: string): Server {
  const server = new Server(
    {
      name: 'mock-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  
  // Create API client with the provided token
  const client = new MockAPIClient(accessToken);
  
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_data',
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
      },
      {
        name: 'list_items',
        description: 'List all items',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'create_item',
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
    ]
  }));
  
  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    
    try {
      let result: any;
      
      switch (name) {
        case 'get_data':
          result = await client.getData((args as any).id);
          break;
          
        case 'list_items':
          result = await client.listItems();
          break;
          
        case 'create_item':
          result = await client.createItem((args as any).name);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  });
  
  // Log server creation (optional)
  if (userId) {
    console.log(`[${new Date().toISOString()}] Created server instance for user: ${userId}`);
  }
  
  return server;
}
