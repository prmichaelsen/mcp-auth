/**
 * Tenant Manager API Contracts
 * 
 * Standard interfaces for tenant manager APIs that MCP servers integrate with.
 * These interfaces help tenant platforms provide consistent APIs for MCP servers.
 */

/**
 * Standard error response format
 * Used by tenant manager APIs
 */
export interface TenantAPIErrorResponse {
  /**
   * Error type/title
   */
  error: string;
  
  /**
   * Human-readable error message
   */
  message?: string;
  
  /**
   * Error code for programmatic handling
   */
  code?: string;
  
  /**
   * Additional error details (development only)
   */
  details?: Record<string, unknown>;
  
  /**
   * Timestamp of the error
   */
  timestamp: string;
}

/**
 * Credentials API response
 * Returned by GET /api/credentials/:userId/:provider
 */
export interface CredentialsAPIResponse {
  /**
   * Access token for the provider
   */
  access_token: string;
  
  /**
   * Token expiration timestamp (ISO 8601)
   */
  expires_at?: string;
  
  /**
   * Provider-specific user ID
   */
  provider_user_id?: string;
  
  /**
   * Provider-specific username
   */
  provider_username?: string;
  
  /**
   * Additional provider-specific metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Standard HTTP status codes for tenant manager APIs
 */
export enum TenantAPIStatusCode {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_ERROR = 500,
  NOT_IMPLEMENTED = 501
}

/**
 * Standard error codes for tenant manager APIs
 */
export enum TenantAPIErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Credentials API request headers
 * Expected by GET /api/credentials/:userId/:provider
 */
export interface CredentialsAPIHeaders {
  /**
   * Service token for MCP server → tenant manager authentication
   */
  'Authorization': string; // Bearer <service-token>
  
  /**
   * Optional: User ID (alternative to path parameter)
   */
  'X-User-ID'?: string;
  
  /**
   * Optional: Request ID for tracing
   */
  'X-Request-ID'?: string;
}

/**
 * Tenant Manager API Contract
 * 
 * Interface that tenant managers should implement for MCP server integration.
 */
export interface TenantManagerAPI {
  /**
   * Get credentials for a user and provider
   * 
   * @endpoint GET /api/credentials/:userId/:provider
   * @auth Service token in Authorization header
   * 
   * @param userId - User identifier
   * @param provider - Provider name (e.g., 'instagram', 'github')
   * @returns Credentials response or error
   * 
   * @example
   * ```
   * GET /api/credentials/user-123/instagram
   * Authorization: Bearer service-token-xyz
   * 
   * Response 200:
   * {
   *   "access_token": "IGQVJXabc...",
   *   "expires_at": "2026-12-31T23:59:59Z",
   *   "provider_user_id": "17841400008460056",
   *   "provider_username": "johndoe"
   * }
   * 
   * Response 404:
   * {
   *   "error": "Not Found",
   *   "message": "Credentials not found for user",
   *   "timestamp": "2026-02-09T21:00:00.000Z"
   * }
   * 
   * Response 401:
   * {
   *   "error": "Unauthorized",
   *   "message": "Token expired",
   *   "code": "TOKEN_EXPIRED",
   *   "timestamp": "2026-02-09T21:00:00.000Z"
   * }
   * ```
   */
  getCredentials(
    userId: string,
    provider: string,
    headers: CredentialsAPIHeaders
  ): Promise<CredentialsAPIResponse | TenantAPIErrorResponse>;
}

/**
 * Helper function to create standardized error responses
 * Tenant managers can use this to ensure consistency
 */
export function createTenantAPIError(
  error: string,
  statusCode: TenantAPIStatusCode,
  options?: {
    message?: string;
    code?: TenantAPIErrorCode;
    details?: Record<string, unknown>;
  }
): TenantAPIErrorResponse {
  return {
    error,
    message: options?.message || error,
    code: options?.code,
    details: options?.details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Common error responses for tenant manager APIs
 */
export const TenantAPIErrors = {
  missingHeader: (headerName: string) =>
    createTenantAPIError(
      'Bad Request',
      TenantAPIStatusCode.BAD_REQUEST,
      {
        message: `${headerName} header required`,
        code: TenantAPIErrorCode.VALIDATION_ERROR
      }
    ),
  
  unsupportedProvider: (provider: string) =>
    createTenantAPIError(
      'Bad Request',
      TenantAPIStatusCode.BAD_REQUEST,
      {
        message: `Unsupported provider: ${provider}`,
        code: TenantAPIErrorCode.VALIDATION_ERROR
      }
    ),
  
  credentialsNotFound: (userId: string, provider: string) =>
    createTenantAPIError(
      'Not Found',
      TenantAPIStatusCode.NOT_FOUND,
      {
        message: `No ${provider} credentials found for user`,
        code: TenantAPIErrorCode.NOT_FOUND,
        details: { userId, provider }
      }
    ),
  
  tokenExpired: (provider: string) =>
    createTenantAPIError(
      'Unauthorized',
      TenantAPIStatusCode.UNAUTHORIZED,
      {
        message: `${provider} token has expired`,
        code: TenantAPIErrorCode.TOKEN_EXPIRED
      }
    ),
  
  internalError: (message?: string) =>
    createTenantAPIError(
      'Internal Server Error',
      TenantAPIStatusCode.INTERNAL_ERROR,
      {
        message: message || 'An unexpected error occurred',
        code: TenantAPIErrorCode.INTERNAL_ERROR
      }
    )
};
