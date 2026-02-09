/**
 * Custom error classes for @prmichaelsen/mcp-auth
 * 
 * Provides specific error types for different failure scenarios.
 */

/**
 * Base error class for all mcp-auth errors
 */
export class MCPAuthError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: string;
  
  /**
   * HTTP status code (for HTTP/SSE transports)
   */
  public readonly statusCode: number;
  
  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string = 'MCP_AUTH_ERROR',
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Convert error to JSON for logging/transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Authentication failed error
 * Thrown when request authentication fails
 */
export class AuthenticationError extends MCPAuthError {
  constructor(message: string = 'Authentication failed', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_FAILED', 401, details);
  }
}

/**
 * Token resolution failed error
 * Thrown when resource token cannot be resolved for a user
 */
export class TokenResolutionError extends MCPAuthError {
  constructor(
    userId: string,
    resourceType: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Failed to resolve ${resourceType} token for user ${userId}`,
      'TOKEN_RESOLUTION_FAILED',
      401,
      { userId, resourceType, ...details }
    );
  }
}

/**
 * Invalid token error
 * Thrown when a token is invalid or expired
 */
export class InvalidTokenError extends MCPAuthError {
  constructor(message: string = 'Invalid or expired token', details?: Record<string, unknown>) {
    super(message, 'INVALID_TOKEN', 401, details);
  }
}

/**
 * Missing credentials error
 * Thrown when required authentication credentials are missing
 */
export class MissingCredentialsError extends MCPAuthError {
  constructor(message: string = 'Missing authentication credentials', details?: Record<string, unknown>) {
    super(message, 'MISSING_CREDENTIALS', 401, details);
  }
}

/**
 * Configuration error
 * Thrown when the server or provider is misconfigured
 */
export class ConfigurationError extends MCPAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
  }
}

/**
 * Rate limit exceeded error
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends MCPAuthError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(
      message,
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter, ...details }
    );
  }
}

/**
 * Server pooling error
 * Thrown when server pool operations fail
 */
export class ServerPoolError extends MCPAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SERVER_POOL_ERROR', 500, details);
  }
}

/**
 * Transport error
 * Thrown when transport-related operations fail
 */
export class TransportError extends MCPAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TRANSPORT_ERROR', 500, details);
  }
}

/**
 * Validation error
 * Thrown when input validation fails
 */
export class ValidationError extends MCPAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Type guard to check if an error is an MCPAuthError
 */
export function isMCPAuthError(error: unknown): error is MCPAuthError {
  return error instanceof MCPAuthError;
}

/**
 * Type guard to check if an error is an authentication error
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is a token resolution error
 */
export function isTokenResolutionError(error: unknown): error is TokenResolutionError {
  return error instanceof TokenResolutionError;
}

/**
 * Type guard to check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Format error for client response
 * Sanitizes sensitive information from error details
 */
export function formatErrorForClient(error: unknown): {
  error: string;
  code: string;
  statusCode: number;
} {
  if (isMCPAuthError(error)) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode
    };
  }
  
  if (error instanceof Error) {
    return {
      error: error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500
    };
  }
  
  return {
    error: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500
  };
}
