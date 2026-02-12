/**
 * Wrapped Instagram MCP Server
 * 
 * Wraps the base instagram-mcp package with mcp-auth for:
 * - JWT authentication
 * - API-based token resolution
 * - Multi-tenant support
 * - CORS security
 */

import { wrapServer, JWTAuthProvider, APITokenResolver } from '@prmichaelsen/mcp-auth';
import { createServer } from 'instagram-mcp';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-jwt-key-min-32-characters';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'service-token-for-mcp-server';
const TENANT_MANAGER_URL = process.env.TENANT_MANAGER_URL || 'http://localhost:3000';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3001';
const PORT = parseInt(process.env.MCP_SERVER_PORT || '3001');

console.log('🚀 Starting wrapped Instagram MCP server...');
console.log('📋 Configuration:');
console.log(`   - Port: ${PORT}`);
console.log(`   - Tenant Manager: ${TENANT_MANAGER_URL}`);
console.log(`   - CORS Origin: ${CORS_ORIGIN}`);
console.log(`   - JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);

const wrapped = wrapServer({
  // Factory creates Instagram server with user's token
  serverFactory: createServer,
  
  // Validates JWT from tenant manager
  authProvider: new JWTAuthProvider({
    jwtSecret: JWT_SECRET,
    userIdClaim: 'sub'
  }),
  
  // Resolves Instagram tokens via tenant manager API
  tokenResolver: new APITokenResolver({
    tenantManagerUrl: TENANT_MANAGER_URL,
    serviceToken: SERVICE_TOKEN,
    cacheTokens: true,
    cacheTtl: 300000 // 5 minutes
  }),
  
  resourceType: 'instagram',
  
  // SSE transport for remote access
  transport: {
    type: 'sse',
    port: PORT,
    host: '0.0.0.0',
    basePath: '/mcp',
    cors: true,
    corsOrigin: CORS_ORIGIN
  },
  
  // Ephemeral instances for security
  instanceMode: 'ephemeral'
});

wrapped.start()
  .then(() => {
    console.log(`\n✅ MCP Server ready!`);
    console.log(`🔗 Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🏥 Health: http://localhost:${PORT}/mcp/health`);
    console.log(`\n📖 To test:`);
    console.log(`   1. Get JWT: curl -X POST ${TENANT_MANAGER_URL}/api/auth/token -H "Content-Type: application/json" -d '{"userId":"user1"}'`);
    console.log(`   2. Use JWT: curl http://localhost:${PORT}/mcp -H "Authorization: Bearer <token>"`);
  })
  .catch((error) => {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down MCP server...');
  await wrapped.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down MCP server...');
  await wrapped.stop();
  process.exit(0);
});
