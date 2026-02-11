/**
 * Server Wrapping with API-Based Token Resolution Example
 * 
 * Demonstrates the RECOMMENDED production pattern:
 * - Wraps existing MCP server (zero modification)
 * - JWT authentication
 * - API-based token resolution
 * - SSE transport for remote access
 */

import { 
  wrapServer,
  JWTAuthProvider,
  APITokenResolver
} from '@prmichaelsen/mcp-auth';
import { createMockServer } from './mock-server.js';

// Validate environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const TENANT_MANAGER_URL = process.env.TENANT_MANAGER_URL;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

if (!JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!TENANT_MANAGER_URL) {
  console.error('Error: TENANT_MANAGER_URL environment variable is required');
  process.exit(1);
}

if (!SERVICE_TOKEN) {
  console.error('Error: SERVICE_TOKEN environment variable is required');
  process.exit(1);
}

console.log('Starting MCP server with API-based token resolution...');
console.log('Configuration:');
console.log(`  JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
console.log(`  Tenant Manager URL: ${TENANT_MANAGER_URL}`);
console.log(`  Service Token: ${SERVICE_TOKEN.substring(0, 10)}...`);
console.log('');

// Wrap the MCP server with authentication
const wrapped = wrapServer({
  // Factory function creates MCP server instances
  serverFactory: createMockServer,
  
  // Validates JWT tokens from tenant manager
  authProvider: new JWTAuthProvider({
    jwtSecret: JWT_SECRET,
    extractTokens: false // We use API resolution, not embedded tokens
  }),
  
  // Resolves tokens via tenant manager API (RECOMMENDED)
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: TENANT_MANAGER_URL,
    serviceToken: SERVICE_TOKEN,
    endpointPath: '/api/credentials/:userId/:resourceType',
    cacheTokens: true, // Cache for 5 minutes
    cacheTtl: 300000,
    timeoutMs: 5000
  }),
  
  resourceType: 'mock-api',
  
  // SSE transport for remote access
  transport: {
    type: 'sse',
    port: 3000,
    host: '0.0.0.0',
    basePath: '/mcp',
    cors: true,
    // SECURITY: Specify explicit CORS origin (required in production)
    corsOrigin: process.env.CORS_ORIGIN || '*' // Wildcard only works in development
  },
  
  // Use ephemeral instances (recommended for security)
  instanceMode: 'ephemeral'
});

// Start the wrapped server
wrapped.start()
  .then(() => {
    console.log('✓ Server started successfully');
    console.log('');
    console.log('Endpoints:');
    console.log('  POST http://localhost:3000/mcp/message - MCP requests');
    console.log('  GET  http://localhost:3000/mcp/health - Health check');
    console.log('');
    console.log('Send requests with JWT in Authorization header:');
    console.log('  Authorization: Bearer <jwt-token>');
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await wrapped.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await wrapped.stop();
  process.exit(0);
});
