# Simple Stdio Example

This example demonstrates the simplest use case: a single-user MCP server using environment variables for authentication.

## Overview

- **Pattern**: Tool-level auth
- **Auth**: Environment variables
- **Transport**: stdio (local)
- **Use case**: Local development, single-user scenarios

## Setup

1. Install dependencies:
```bash
cd examples/simple-stdio
npm install
```

2. Set environment variables:
```bash
export MCP_USER_ID="local-user"
export API_TOKEN="your-api-token-here"
```

3. Run the server:
```bash
npm start
```

## How It Works

The server uses:
- `EnvAuthProvider` - Reads user ID from `MCP_USER_ID` env var
- `SimpleTokenResolver` - Reads API token from `API_TOKEN` env var
- `withAuth()` - Automatically injects token into tool handlers

## Code Structure

- `index.ts` - Main server implementation
- `package.json` - Dependencies and scripts
- `.env.example` - Example environment variables

## Usage with Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "simple-example": {
      "command": "node",
      "args": ["/path/to/examples/simple-stdio/dist/index.js"],
      "env": {
        "MCP_USER_ID": "local-user",
        "API_TOKEN": "your-api-token"
      }
    }
  }
}
```
