/**
 * Instagram MCP Server Factory
 * 
 * Creates an MCP server instance for Instagram integration.
 * This is the base server that can be used standalone or wrapped with mcp-auth.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { InstagramClient } from './instagram-client.js';

/**
 * Create Instagram MCP server
 * 
 * @param accessToken - Instagram access token
 * @param userId - Optional user identifier
 * @returns Configured MCP server instance
 */
export function createServer(accessToken: string, userId?: string): Server {
  const server = new Server({
    name: 'instagram-mcp',
    version: '1.0.0'
  });
  
  const client = new InstagramClient(accessToken);
  
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'instagram_get_profile',
        description: 'Get Instagram user profile information',
        inputSchema: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'Instagram username to fetch'
            }
          },
          required: ['username']
        }
      }
    ]
  }));
  
  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      if (name === 'instagram_get_profile') {
        if (!args || typeof args.username !== 'string') {
          throw new Error('username is required');
        }
        const profile = await client.getProfile(args.username);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(profile, null, 2)
          }]
        };
      }
      
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  });
  
  return server;
}
