/**
 * Utilities module exports
 */

// Errors
export {
  MCPAuthError,
  AuthenticationError,
  TokenResolutionError,
  InvalidTokenError,
  MissingCredentialsError,
  ConfigurationError,
  RateLimitError,
  ServerPoolError,
  TransportError,
  ValidationError,
  isMCPAuthError,
  isAuthenticationError,
  isTokenResolutionError,
  isRateLimitError,
  formatErrorForClient
} from './errors.js';

// Logger
export {
  Logger,
  LogLevel,
  defaultLogger,
  createLogger,
  sanitizeForLogging,
  type LogEntry
} from './logger.js';

// Validation
export {
  validateNonEmptyString,
  validateUrl,
  validatePositiveNumber,
  validatePort,
  validateEnum,
  validateObject,
  validateFunction,
  validateRequiredFields,
  validateTransportConfig,
  validateRateLimitConfig,
  validateLoggingConfig,
  validatePoolingConfig,
  sanitizeString,
  validateUserId,
  validateResourceType,
  validateAccessToken
} from './validation.js';
