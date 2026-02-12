/**
 * Instagram MCP Package
 * 
 * Base Instagram MCP server that can be used standalone or wrapped with mcp-auth.
 * Exports a factory function that creates a configured MCP server instance.
 */

export { createServer } from './server-factory.js';
export { InstagramClient } from './instagram-client.js';
