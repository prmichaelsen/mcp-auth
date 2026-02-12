#!/usr/bin/env node
/**
 * Test script for JWT dynamic example
 * 
 * Tests the complete authentication flow:
 * 1. Get JWT from tenant manager
 * 2. Use JWT to call MCP server
 * 3. Verify Instagram API integration
 */

const TENANT_MANAGER_URL = process.env.TENANT_MANAGER_URL || 'http://localhost:3000';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';
const MOCK_INSTAGRAM_URL = process.env.MOCK_INSTAGRAM_URL || 'http://localhost:3002';

async function test() {
  console.log('🧪 Testing JWT Dynamic Example\n');
  
  try {
    // Test 1: Health checks
    console.log('1️⃣  Testing health endpoints...');
    await testHealth(`${TENANT_MANAGER_URL}/health`, 'Tenant Manager');
    await testHealth(`${MCP_SERVER_URL}/mcp/health`, 'MCP Server');
    await testHealth(`${MOCK_INSTAGRAM_URL}/health`, 'Mock Instagram');
    console.log('✅ All services healthy\n');
    
    // Test 2: Get JWT
    console.log('2️⃣  Getting JWT for user1...');
    const jwtResponse = await fetch(`${TENANT_MANAGER_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user1' })
    });
    
    if (!jwtResponse.ok) {
      throw new Error(`Failed to get JWT: ${jwtResponse.statusText}`);
    }
    
    const { token } = await jwtResponse.json();
    console.log(`✅ JWT obtained: ${token.substring(0, 20)}...\n`);
    
    // Test 3: Call MCP server
    console.log('3️⃣  Calling MCP server with JWT...');
    const mcpResponse = await fetch(`${MCP_SERVER_URL}/mcp`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!mcpResponse.ok) {
      throw new Error(`MCP server request failed: ${mcpResponse.statusText}`);
    }
    
    console.log('✅ MCP server authenticated request\n');
    
    // Test 4: Call Instagram tool
    console.log('4️⃣  Calling instagram_get_profile tool...');
    const toolResponse = await fetch(`${MCP_SERVER_URL}/mcp/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'instagram_get_profile',
          arguments: { username: 'alice' }
        }
      })
    });
    
    if (!toolResponse.ok) {
      throw new Error(`Tool call failed: ${toolResponse.statusText}`);
    }
    
    const toolResult = await toolResponse.json();
    console.log('✅ Tool executed successfully');
    console.log('📊 Result:', JSON.stringify(toolResult, null, 2));
    
    console.log('\n🎉 All tests passed!');
    console.log('\n✨ The JWT dynamic example is working correctly!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function testHealth(url, name) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name} health check failed`);
  }
  const data = await response.json();
  console.log(`   ✓ ${name}: ${data.status}`);
}

test();
