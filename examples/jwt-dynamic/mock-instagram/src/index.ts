/**
 * Mock Instagram API
 * 
 * Simulates Instagram Graph API for testing purposes.
 * Returns mock data for profile requests.
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.MOCK_INSTAGRAM_PORT || 3002;

// Mock user database
const mockUsers = new Map([
  ['alice', {
    id: '123456789',
    username: 'alice',
    full_name: 'Alice Johnson',
    profile_picture: 'https://via.placeholder.com/150/FF6B9D/FFFFFF?text=Alice',
    followers_count: 1234,
    following_count: 567,
    media_count: 89
  }],
  ['bob', {
    id: '987654321',
    username: 'bob',
    full_name: 'Bob Smith',
    profile_picture: 'https://via.placeholder.com/150/4ECDC4/FFFFFF?text=Bob',
    followers_count: 5678,
    following_count: 234,
    media_count: 156
  }],
  ['charlie', {
    id: '456789123',
    username: 'charlie',
    full_name: 'Charlie Brown',
    profile_picture: 'https://via.placeholder.com/150/FFE66D/000000?text=Charlie',
    followers_count: 9012,
    following_count: 890,
    media_count: 234
  }]
]);

// Validate Instagram token format
function validateToken(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const token = authHeader.split(' ')[1];
  return !!(token && token.startsWith('IGTOKEN_'));
}

// Get user profile endpoint
app.get('/v1/users/:username', (req, res) => {
  const { username } = req.params;
  
  // Validate token
  if (!validateToken(req.headers.authorization)) {
    return res.status(401).json({
      error: {
        message: 'Invalid Instagram access token',
        type: 'OAuthException',
        code: 190
      }
    });
  }
  
  // Get user data
  const user = mockUsers.get(username);
  if (!user) {
    return res.status(404).json({
      error: {
        message: 'User not found',
        type: 'IGApiException',
        code: 100
      }
    });
  }
  
  res.json({
    data: user
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'mock-instagram-api',
    users: Array.from(mockUsers.keys())
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎭 Mock Instagram API running on http://localhost:${PORT}`);
  console.log(`📊 Available users: ${Array.from(mockUsers.keys()).join(', ')}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
