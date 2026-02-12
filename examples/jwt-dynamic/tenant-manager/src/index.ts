/**
 * Tenant Manager
 * 
 * Issues JWTs and manages user credentials for MCP servers.
 * Provides:
 * - POST /api/auth/token - Issue JWT for a user
 * - GET /api/credentials/:userId/:resourceType - Get user's resource token
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.TENANT_MANAGER_PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-jwt-key-min-32-characters';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'service-token-for-mcp-server';

// In-memory user database
interface User {
  id: string;
  username: string;
  credentials: {
    [resourceType: string]: string;
  };
}

const users = new Map<string, User>([
  ['user1', {
    id: 'user1',
    username: 'alice',
    credentials: {
      instagram: 'IGTOKEN_alice_12345'
    }
  }],
  ['user2', {
    id: 'user2',
    username: 'bob',
    credentials: {
      instagram: 'IGTOKEN_bob_67890'
    }
  }],
  ['user3', {
    id: 'user3',
    username: 'charlie',
    credentials: {
      instagram: 'IGTOKEN_charlie_11111'
    }
  }]
]);

// Issue JWT endpoint
app.post('/api/auth/token', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const token = jwt.sign(
    {
      sub: userId,
      userId,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  res.json({
    token,
    expiresIn: 3600,
    userId,
    username: user.username
  });
});

// Credentials API endpoint (for MCP server)
app.get('/api/credentials/:userId/:resourceType', (req, res) => {
  const { userId, resourceType } = req.params;
  const authHeader = req.headers.authorization;
  
  // Verify service token
  if (!authHeader || authHeader !== `Bearer ${SERVICE_TOKEN}`) {
    return res.status(401).json({
      error: 'Invalid service token',
      code: 'UNAUTHORIZED'
    });
  }
  
  // Get user
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }
  
  // Get credentials
  const token = user.credentials[resourceType];
  if (!token) {
    return res.status(404).json({
      error: `No ${resourceType} credentials found for user`,
      code: 'CREDENTIALS_NOT_FOUND'
    });
  }
  
  res.json({
    userId,
    resourceType,
    accessToken: token,
    expiresAt: Date.now() + 3600000 // 1 hour from now
  });
});

// List users endpoint (for testing)
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    resources: Object.keys(u.credentials)
  }));
  
  res.json({ users: userList });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'tenant-manager',
    users: users.size
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 Tenant Manager running on http://localhost:${PORT}`);
  console.log(`📝 Available users:`);
  users.forEach((user, id) => {
    console.log(`   - ${id} (${user.username}): ${Object.keys(user.credentials).join(', ')}`);
  });
  console.log(`\n🔗 Endpoints:`);
  console.log(`   - POST /api/auth/token - Issue JWT`);
  console.log(`   - GET /api/credentials/:userId/:resourceType - Get credentials`);
  console.log(`   - GET /api/users - List users`);
  console.log(`   - GET /health - Health check`);
});
