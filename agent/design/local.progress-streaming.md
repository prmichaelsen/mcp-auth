# Design: Progress Streaming for Long-Running Commands

**Concept**: Real-time output streaming for long-running SSH commands using MCP progress notifications
**Created**: 2026-02-23
**Status**: Design Specification
**Version**: 1.0.0

---

## Overview

This design document specifies how to implement real-time progress streaming for long-running commands in acp-mcp using the MCP SDK's built-in progress notification system. This enables users to see live output from commands like `npm run dev`, `npm run build`, or `npm test` as they execute on remote machines.

## Problem Statement

Currently, `acp_remote_execute_command` uses a timeout-based approach where:
- Command executes completely before returning any output
- Users wait without feedback for long-running operations
- Commands that exceed timeout fail, even if still running
- No way to see incremental progress or output

**User Impact**:
- Poor experience for long-running builds (5+ minutes)
- Cannot monitor development servers in real-time
- Difficult to debug failing commands (no intermediate output)
- Timeout errors for legitimate long operations

**Example Scenarios**:
```bash
# Build that takes 10 minutes - user sees nothing until complete or timeout
npm run build

# Dev server - runs indefinitely, would timeout
npm run dev

# Test suite - want to see tests as they run
npm test --verbose
```

## Solution

Implement **progress streaming** using MCP SDK's native progress notification system:

1. **Detect progress support** - Check if client provided `progressToken`
2. **Stream SSH output** - Use SSH stream instead of buffered execution
3. **Send progress notifications** - Forward output chunks to client in real-time
4. **Graceful fallback** - Use existing timeout approach if no progress support

### Architecture

```
┌─────────────┐                    ┌──────────────┐                    ┌─────────────┐
│   Client    │                    │   acp-mcp    │                    │   Remote    │
│ (Claude/UI) │                    │   Server     │                    │   Machine   │
└─────────────┘                    └──────────────┘                    └─────────────┘
       │                                   │                                   │
       │ CallTool(progressToken=123)      │                                   │
       ├──────────────────────────────────>│                                   │
       │                                   │ SSH exec stream                   │
       │                                   ├──────────────────────────────────>│
       │                                   │                                   │
       │                                   │<──────────────────────────────────┤
       │                                   │ stdout chunk 1                    │
       │<──────────────────────────────────┤                                   │
       │ Progress(token=123, msg=chunk1)   │                                   │
       │                                   │                                   │
       │                                   │<──────────────────────────────────┤
       │                                   │ stdout chunk 2                    │
       │<──────────────────────────────────┤                                   │
       │ Progress(token=123, msg=chunk2)   │                                   │
       │                                   │                                   │
       │                                   │<──────────────────────────────────┤
       │                                   │ exit code 0                       │
       │<──────────────────────────────────┤                                   │
       │ Result(stdout=full, exitCode=0)   │                                   │
       │                                   │                                   │
```

---

## Implementation

### 1. Update SSHConnectionManager

Add streaming execution method:

```typescript
// src/utils/ssh-connection.ts

/**
 * Execute command with streaming output
 * Returns a stream that emits data chunks as they arrive
 */
async execStream(
  command: string,
  cwd?: string
): Promise<{
  stream: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  exitCode: Promise<number>;
}> {
  if (!this.connected) {
    await this.connect();
  }

  const fullCommand = cwd ? `cd "${cwd}" && ${command}` : command;
  logger.sshCommand(fullCommand, cwd);

  return new Promise((resolve, reject) => {
    this.client.exec(fullCommand, (err, stream) => {
      if (err) {
        logger.error('SSH exec failed', { command: fullCommand, error: err.message });
        reject(err);
        return;
      }

      const exitCodePromise = new Promise<number>((resolveExit) => {
        stream.on('close', (code: number) => {
          logger.debug('SSH stream closed', { command: fullCommand, exitCode: code });
          resolveExit(code);
        });
      });

      resolve({
        stream: stream,
        stderr: stream.stderr,
        exitCode: exitCodePromise,
      });
    });
  });
}
```

### 2. Update Tool Handler

Modify `acp_remote_execute_command` to support progress:

```typescript
// src/tools/acp-remote-execute-command.ts

export async function handleAcpRemoteExecuteCommand(
  args: any,
  sshConnection: SSHConnectionManager,
  extra?: { progressToken?: string | number }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { command, cwd, timeout = 30 } = args;
  const progressToken = extra?.progressToken;

  try {
    // If progress token provided, use streaming
    if (progressToken) {
      return await executeWithProgress(command, cwd, sshConnection, progressToken);
    }
    
    // Otherwise, use existing timeout-based execution
    const result = await sshConnection.execWithTimeout(command, timeout);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Error executing command: ${errorMessage}`,
      }],
    };
  }
}

/**
 * Execute command with progress streaming
 */
async function executeWithProgress(
  command: string,
  cwd: string | undefined,
  sshConnection: SSHConnectionManager,
  progressToken: string | number
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { stream, stderr: stderrStream, exitCode } = await sshConnection.execStream(command, cwd);
  
  let stdout = '';
  let stderr = '';
  let bytesReceived = 0;

  // Stream stdout with progress notifications
  stream.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    bytesReceived += chunk.length;
    
    // Send progress notification
    server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: bytesReceived,
        total: undefined, // Unknown total for streaming
        message: text, // Send chunk as message
      },
    });
    
    logger.debug('Progress sent', { progressToken, bytes: bytesReceived });
  });

  // Collect stderr (no progress for errors)
  stderrStream.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Wait for completion
  const finalExitCode = await exitCode;
  
  logger.debug('Command completed', { 
    command, 
    exitCode: finalExitCode,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        stdout,
        stderr,
        exitCode: finalExitCode,
        timedOut: false,
        streamed: true, // Indicate this was streamed
      }, null, 2),
    }],
  };
}
```

### 3. Update Server Request Handler

Pass `extra` parameter to tool handlers:

```typescript
// src/server.ts and src/server-factory.ts

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const startTime = Date.now();
  logger.toolInvoked(request.params.name, request.params.arguments);
  
  try {
    let result;
    
    if (request.params.name === 'acp_remote_execute_command') {
      // Pass extra parameter for progress token
      result = await handleAcpRemoteExecuteCommand(
        request.params.arguments,
        sshConnection,
        extra // Contains progressToken if provided
      );
    } else if (request.params.name === 'acp_remote_list_files') {
      result = await handleAcpRemoteListFiles(request.params.arguments, sshConnection);
    } else if (request.params.name === 'acp_remote_read_file') {
      result = await handleAcpRemoteReadFile(request.params.arguments, sshConnection);
    } else if (request.params.name === 'acp_remote_write_file') {
      result = await handleAcpRemoteWriteFile(request.params.arguments, sshConnection);
    } else {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    
    const duration = Date.now() - startTime;
    const resultSize = JSON.stringify(result).length;
    logger.toolCompleted(request.params.name, duration, resultSize);
    
    return result;
  } catch (error) {
    logger.toolFailed(request.params.name, error as Error, request.params.arguments);
    throw error;
  }
});
```

### 4. Update Tool Schema (Optional)

Document progress support in tool description:

```typescript
// src/tools/acp-remote-execute-command.ts

export const acpRemoteExecuteCommandTool: Tool = {
  name: 'acp_remote_execute_command',
  description: 'Execute a shell command on the remote machine via SSH. Supports real-time progress streaming if client provides progressToken.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (optional)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds (default: 30). Ignored if progress streaming is used.',
        default: 30,
      },
    },
    required: ['command'],
  },
};
```

---

## Benefits

### For Users

1. **Real-time feedback** - See output as it happens
2. **Better debugging** - See where commands fail
3. **No artificial timeouts** - Long operations can run indefinitely
4. **Progress visibility** - Know command is still running
5. **Better UX** - More responsive feel

### For Developers

1. **Native MCP feature** - No custom protocol needed
2. **Graceful degradation** - Works with or without client support
3. **No breaking changes** - Existing API still works
4. **Simple implementation** - SDK handles complexity
5. **Reliable** - Built on proven SSH streaming

---

## Trade-offs

### Advantages

✅ **Real-time output** - Users see progress immediately
✅ **No timeout issues** - Progress resets timeout automatically
✅ **Standard protocol** - Uses MCP SDK features
✅ **Backward compatible** - Falls back to timeout mode
✅ **Better UX** - More responsive and informative

### Disadvantages

⚠️ **Client dependency** - Requires client support for progress
⚠️ **Complexity** - Two execution paths (streaming vs timeout)
⚠️ **Memory usage** - Must buffer full output for final result
⚠️ **Network overhead** - More messages sent (progress notifications)
⚠️ **Testing complexity** - Need to test both modes

### Decision

**Implement with graceful fallback**: Use streaming when `progressToken` provided, otherwise use existing timeout approach. This gives best of both worlds with no breaking changes.

---

## Client Support

### MCP SDK Support

**Confirmed**: `@modelcontextprotocol/sdk` v1.26.0 has full support:
- `progressToken` parameter in request params
- `onprogress` callback for client-side handling
- Progress notifications reset request timeout
- Task-augmented requests for long operations

### Client Implementation

**Client Side** (Claude Desktop, mcp-auth, etc.):
```typescript
const result = await client.request({
  method: 'tools/call',
  params: {
    name: 'acp_remote_execute_command',
    arguments: { command: 'npm run build' }
  }
}, {
  progressToken: 'build-123', // Request progress
  onprogress: (progress) => {
    // Display progress to user
    console.log(progress.message);
    updateUI(progress);
  }
});
```

### Compatibility

**Known Support**:
- ✅ MCP SDK v1.26.0+ (confirmed)
- ❓ Claude Desktop (unknown version support)
- ❓ mcp-auth wrapper (needs testing)
- ❓ Other MCP clients (varies)

**Fallback**: If client doesn't provide `progressToken`, uses existing timeout-based execution. No functionality lost.

---

## Use Cases

### Use Case 1: Long Build Process

**Scenario**: Building a large TypeScript project (10 minutes)

**Without Progress**:
```
User: Run npm run build
[10 minutes of silence]
Result: Build complete (or timeout error)
```

**With Progress**:
```
User: Run npm run build
[Immediate feedback]
> Building...
> Compiling src/index.ts
> Compiling src/utils.ts
> [100 more files...]
> Build complete!
Result: Build complete with full output
```

### Use Case 2: Development Server

**Scenario**: Starting a dev server that runs indefinitely

**Without Progress**:
```
User: Run npm run dev
[30 seconds]
Error: Command timed out
```

**With Progress**:
```
User: Run npm run dev
> Starting dev server...
> Webpack compiled successfully
> Server running on http://localhost:3000
[Server continues running, user sees logs in real-time]
```

### Use Case 3: Test Suite

**Scenario**: Running comprehensive test suite (5 minutes)

**Without Progress**:
```
User: Run npm test
[5 minutes of silence]
Result: 150 tests passed
```

**With Progress**:
```
User: Run npm test
> Running test suite...
> ✓ Auth tests (15 passed)
> ✓ API tests (42 passed)
> ✓ Integration tests (93 passed)
> All tests passed!
Result: 150 tests passed with details
```

---

## Error Handling

### SSH Stream Errors

```typescript
stream.on('error', (error) => {
  logger.error('SSH stream error', { error: error.message });
  
  // Send error via progress
  server.notification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress: bytesReceived,
      message: `Error: ${error.message}`,
    },
  });
  
  // Return error in final result
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        stdout,
        stderr: stderr + `\nStream error: ${error.message}`,
        exitCode: -1,
        error: error.message,
      }),
    }],
  };
});
```

### Connection Loss

```typescript
// Detect connection loss
this.client.on('close', () => {
  if (streamActive) {
    logger.error('SSH connection closed during streaming');
    // Notify client
    server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        message: 'Connection lost',
      },
    });
  }
});
```

### Timeout Management

```typescript
// Progress notifications reset timeout automatically (MCP SDK feature)
// But we can add explicit timeout for safety:

const maxDuration = 3600; // 1 hour max
const startTime = Date.now();

stream.on('data', (chunk) => {
  const elapsed = (Date.now() - startTime) / 1000;
  
  if (elapsed > maxDuration) {
    stream.destroy();
    throw new Error('Command exceeded maximum duration (1 hour)');
  }
  
  // Send progress...
});
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('executeWithProgress', () => {
  it('should stream output chunks', async () => {
    const mockStream = new EventEmitter();
    const progressNotifications: any[] = [];
    
    // Mock server.notification
    server.notification = (params) => {
      progressNotifications.push(params);
    };
    
    // Simulate streaming
    mockStream.emit('data', Buffer.from('chunk 1\n'));
    mockStream.emit('data', Buffer.from('chunk 2\n'));
    mockStream.emit('close', 0);
    
    expect(progressNotifications).toHaveLength(2);
    expect(progressNotifications[0].params.message).toBe('chunk 1\n');
  });
  
  it('should fall back to timeout mode without progressToken', async () => {
    const result = await handleAcpRemoteExecuteCommand(
      { command: 'echo test' },
      sshConnection,
      undefined // No progressToken
    );
    
    expect(result.content[0].text).toContain('test');
  });
});
```

### Integration Tests

```typescript
describe('Progress Streaming Integration', () => {
  it('should stream real SSH command output', async () => {
    const ssh = new SSHConnectionManager(testConfig);
    await ssh.connect();
    
    const progressMessages: string[] = [];
    const progressToken = 'test-123';
    
    // Mock notification handler
    server.notification = (params) => {
      if (params.params.progressToken === progressToken) {
        progressMessages.push(params.params.message);
      }
    };
    
    await handleAcpRemoteExecuteCommand(
      { command: 'for i in 1 2 3; do echo "Line $i"; sleep 0.1; done' },
      ssh,
      { progressToken }
    );
    
    expect(progressMessages.length).toBeGreaterThan(0);
    expect(progressMessages.join('')).toContain('Line 1');
  });
});
```

### Manual Testing

1. **Test with Claude Desktop** (if supports progress)
2. **Test with mcp-auth wrapper**
3. **Test long-running commands** (`npm run build`)
4. **Test infinite commands** (`npm run dev`)
5. **Test error scenarios** (command fails mid-stream)
6. **Test connection loss** (kill SSH during stream)

---

## Migration Path

### Phase 1: Implementation (v0.7.0)

- Add `execStream()` to SSHConnectionManager
- Update `acp_remote_execute_command` handler
- Add progress notification logic
- Maintain backward compatibility

### Phase 2: Testing (v0.7.0)

- Unit tests for streaming
- Integration tests with real SSH
- Manual testing with various commands
- Performance testing (memory, network)

### Phase 3: Documentation (v0.7.0)

- Update README with progress support
- Add examples of streaming usage
- Document client requirements
- Update CHANGELOG

### Phase 4: Deployment (v0.7.0)

- Deploy to npm
- Test with mcp-auth wrapper
- Test with agentbase.me platform
- Monitor for issues

### Phase 5: Optimization (v0.8.0+)

- Add progress percentage calculation
- Implement smart buffering
- Add progress rate limiting (avoid spam)
- Add configurable chunk sizes

---

## Future Enhancements

### 1. Background Process Management

Combine progress streaming with background processes:

```typescript
// Start process in background with log streaming
{
  name: 'acp_remote_start_process_with_logs',
  handler: async (args, ssh, extra) => {
    const { command, logFile } = args;
    
    // Start in background
    await ssh.exec(`nohup ${command} > ${logFile} 2>&1 &`);
    
    // Stream log file if progressToken provided
    if (extra?.progressToken) {
      await streamLogFile(logFile, ssh, extra.progressToken);
    }
  }
}
```

### 2. Interactive Commands

Support for interactive commands (requires stdin):

```typescript
// Send input to running command
{
  name: 'acp_remote_send_input',
  handler: async (args, ssh) => {
    const { processId, input } = args;
    // Send input to stdin of running process
  }
}
```

### 3. Progress Percentage

Calculate progress for known operations:

```typescript
// For npm install, parse package count
stream.on('data', (chunk) => {
  const match = chunk.toString().match(/(\d+)\/(\d+)/);
  if (match) {
    const [_, current, total] = match;
    server.notification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: parseInt(current),
        total: parseInt(total),
        message: chunk.toString(),
      },
    });
  }
});
```

### 4. Multi-Command Streaming

Stream output from multiple commands in sequence:

```typescript
const commands = ['npm install', 'npm run build', 'npm test'];
let overallProgress = 0;

for (const command of commands) {
  await executeWithProgress(command, ...);
  overallProgress += 33; // Each command is 33% of total
  
  server.notification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress: overallProgress,
      total: 100,
    },
  });
}
```

---

## Performance Considerations

### Memory Usage

**Issue**: Buffering full output for final result

**Solution**:
- Limit buffer size (e.g., 10MB max)
- Truncate if exceeded
- Notify user of truncation

```typescript
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB

stream.on('data', (chunk) => {
  if (stdout.length + chunk.length > MAX_BUFFER) {
    stdout += '\n[Output truncated - exceeded 10MB limit]';
    stream.destroy();
    return;
  }
  stdout += chunk.toString();
  // Send progress...
});
```

### Network Overhead

**Issue**: Many progress notifications increase network traffic

**Solution**:
- Rate limit notifications (e.g., max 10/second)
- Batch small chunks
- Only send on newlines for text output

```typescript
let lastProgressTime = 0;
const MIN_PROGRESS_INTERVAL = 100; // 100ms between notifications

stream.on('data', (chunk) => {
  stdout += chunk.toString();
  
  const now = Date.now();
  if (now - lastProgressTime >= MIN_PROGRESS_INTERVAL) {
    server.notification({ /* ... */ });
    lastProgressTime = now;
  }
});
```

### CPU Usage

**Issue**: Parsing and formatting progress messages

**Solution**:
- Minimal processing in hot path
- Defer complex parsing to final result
- Use efficient string operations

---

## Security Considerations

### Output Sanitization

**Risk**: Sensitive data in command output (passwords, keys)

**Mitigation**:
- Warn users about streaming sensitive commands
- Consider adding output filtering
- Log warnings for commands with sensitive patterns

```typescript
const SENSITIVE_PATTERNS = [
  /password[=:]\s*\S+/i,
  /api[_-]?key[=:]\s*\S+/i,
  /secret[=:]\s*\S+/i,
];

function sanitizeOutput(text: string): string {
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}
```

### Resource Limits

**Risk**: Malicious commands consuming resources

**Mitigation**:
- Maximum duration limit (1 hour)
- Maximum output size (10MB)
- Rate limiting on progress notifications
- Monitor CPU/memory usage

### Command Injection

**Risk**: Same as existing execute_command

**Mitigation**:
- SSH handles command escaping
- No additional risk from streaming
- Existing security measures apply

---

## Alternatives Considered

### Alternative 1: Polling-Based Progress

**Approach**: Return job ID, poll for updates

**Pros**:
- Works with all clients
- Simple to implement
- No protocol changes

**Cons**:
- Not real-time (polling delay)
- More complex state management
- Higher latency

**Decision**: Rejected - MCP SDK has native progress support

### Alternative 2: WebSocket Transport

**Approach**: Use WebSocket instead of stdio

**Pros**:
- True bidirectional streaming
- Lower latency
- More flexible

**Cons**:
- Requires transport change
- Not compatible with stdio clients
- More complex deployment

**Decision**: Rejected - stdio is standard for MCP

### Alternative 3: Server-Sent Events (SSE)

**Approach**: Use SSE transport for streaming

**Pros**:
- Native streaming support
- HTTP-based (firewall friendly)
- Good browser support

**Cons**:
- Requires SSE transport
- Not compatible with stdio
- More complex setup

**Decision**: Rejected - progress notifications work with stdio

---

## Recommendation

**Implement progress streaming in v0.7.0** with:

1. ✅ Use MCP SDK progress notifications (native support)
2. ✅ Graceful fallback to timeout mode (backward compatible)
3. ✅ Start with `acp_remote_execute_command` (highest value)
4. ✅ Add comprehensive testing (unit + integration)
5. ✅ Document client requirements (README)
6. ✅ Monitor performance (memory, network)

**Timeline**:
- Implementation: 1-2 days
- Testing: 1 day
- Documentation: 0.5 days
- Total: 2-3 days

**Priority**: Medium (nice-to-have, not critical)

**Dependencies**: None (SDK already supports it)

---

**Status**: Design Specification
**Next Steps**: Create milestone and tasks for implementation
**Version**: 1.0.0
**Compatibility**: Requires MCP SDK v1.26.0+
