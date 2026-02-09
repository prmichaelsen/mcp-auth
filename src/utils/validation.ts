/**
 * Validation utilities for @prmichaelsen/mcp-auth
 * 
 * Provides input validation and sanitization functions.
 */

import { ValidationError } from './errors.js';

/**
 * Validate that a value is a non-empty string
 */
export function validateNonEmptyString(
  value: unknown,
  fieldName: string
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`);
  }
}

/**
 * Validate that a value is a valid URL
 */
export function validateUrl(value: unknown, fieldName: string): asserts value is string {
  validateNonEmptyString(value, fieldName);
  
  try {
    new URL(value);
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

/**
 * Validate that a value is a positive number
 */
export function validatePositiveNumber(
  value: unknown,
  fieldName: string
): asserts value is number {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a positive number`);
  }
}

/**
 * Validate that a value is a valid port number
 */
export function validatePort(value: unknown, fieldName: string): asserts value is number {
  validatePositiveNumber(value, fieldName);
  
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ValidationError(`${fieldName} must be a valid port number (1-65535)`);
  }
}

/**
 * Validate that a value is one of the allowed values
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string
): asserts value is T {
  if (!allowedValues.includes(value as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`
    );
  }
}

/**
 * Validate that a value is a valid object
 */
export function validateObject(
  value: unknown,
  fieldName: string
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`);
  }
}

/**
 * Validate that a value is a function
 */
export function validateFunction(
  value: unknown,
  fieldName: string
): asserts value is Function {
  if (typeof value !== 'function') {
    throw new ValidationError(`${fieldName} must be a function`);
  }
}

/**
 * Validate required fields in an object
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
  obj: T,
  requiredFields: (keyof T)[],
  objectName: string = 'Object'
): void {
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      throw new ValidationError(`${objectName} is missing required field: ${String(field)}`);
    }
  }
}

/**
 * Validate transport configuration
 */
export function validateTransportConfig(config: unknown): void {
  validateObject(config, 'Transport configuration');
  
  const cfg = config as Record<string, unknown>;
  
  validateRequiredFields(cfg, ['type'], 'Transport configuration');
  validateEnum(cfg.type, ['stdio', 'sse', 'http'] as const, 'transport.type');
  
  if (cfg.type === 'sse' || cfg.type === 'http') {
    if (cfg.port !== undefined) {
      validatePort(cfg.port, 'transport.port');
    }
    
    if (cfg.host !== undefined) {
      validateNonEmptyString(cfg.host, 'transport.host');
    }
    
    if (cfg.basePath !== undefined) {
      validateNonEmptyString(cfg.basePath, 'transport.basePath');
      
      const basePath = cfg.basePath as string;
      if (!basePath.startsWith('/')) {
        throw new ValidationError('transport.basePath must start with /');
      }
    }
  }
}

/**
 * Validate rate limit configuration
 */
export function validateRateLimitConfig(config: unknown): void {
  validateObject(config, 'Rate limit configuration');
  
  const cfg = config as Record<string, unknown>;
  
  validateRequiredFields(cfg, ['enabled', 'maxRequests', 'windowMs'], 'Rate limit configuration');
  
  if (typeof cfg.enabled !== 'boolean') {
    throw new ValidationError('rateLimit.enabled must be a boolean');
  }
  
  validatePositiveNumber(cfg.maxRequests, 'rateLimit.maxRequests');
  validatePositiveNumber(cfg.windowMs, 'rateLimit.windowMs');
  
  if (cfg.keyGenerator !== undefined) {
    validateFunction(cfg.keyGenerator, 'rateLimit.keyGenerator');
  }
}

/**
 * Validate logging configuration
 */
export function validateLoggingConfig(config: unknown): void {
  validateObject(config, 'Logging configuration');
  
  const cfg = config as Record<string, unknown>;
  
  validateRequiredFields(cfg, ['enabled', 'level'], 'Logging configuration');
  
  if (typeof cfg.enabled !== 'boolean') {
    throw new ValidationError('logging.enabled must be a boolean');
  }
  
  validateEnum(cfg.level, ['debug', 'info', 'warn', 'error'] as const, 'logging.level');
  
  if (cfg.format !== undefined) {
    validateEnum(cfg.format, ['json', 'text'] as const, 'logging.format');
  }
  
  if (cfg.logBodies !== undefined && typeof cfg.logBodies !== 'boolean') {
    throw new ValidationError('logging.logBodies must be a boolean');
  }
}

/**
 * Validate pooling configuration
 */
export function validatePoolingConfig(config: unknown): void {
  validateObject(config, 'Pooling configuration');
  
  const cfg = config as Record<string, unknown>;
  
  validateRequiredFields(cfg, ['enabled'], 'Pooling configuration');
  
  if (typeof cfg.enabled !== 'boolean') {
    throw new ValidationError('pooling.enabled must be a boolean');
  }
  
  if (cfg.maxServersPerUser !== undefined) {
    validatePositiveNumber(cfg.maxServersPerUser, 'pooling.maxServersPerUser');
  }
  
  if (cfg.idleTimeoutMs !== undefined) {
    validatePositiveNumber(cfg.idleTimeoutMs, 'pooling.idleTimeoutMs');
  }
  
  if (cfg.maxTotalServers !== undefined) {
    validatePositiveNumber(cfg.maxTotalServers, 'pooling.maxTotalServers');
  }
}

/**
 * Sanitize string input (remove control characters, trim)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Validate and sanitize user ID
 */
export function validateUserId(userId: unknown): string {
  validateNonEmptyString(userId, 'userId');
  
  const sanitized = sanitizeString(userId);
  
  if (sanitized.length === 0) {
    throw new ValidationError('userId cannot be empty after sanitization');
  }
  
  if (sanitized.length > 255) {
    throw new ValidationError('userId must be 255 characters or less');
  }
  
  return sanitized;
}

/**
 * Validate and sanitize resource type
 */
export function validateResourceType(resourceType: unknown): string {
  validateNonEmptyString(resourceType, 'resourceType');
  
  const sanitized = sanitizeString(resourceType).toLowerCase();
  
  if (sanitized.length === 0) {
    throw new ValidationError('resourceType cannot be empty after sanitization');
  }
  
  if (!/^[a-z0-9_-]+$/.test(sanitized)) {
    throw new ValidationError(
      'resourceType must contain only lowercase letters, numbers, hyphens, and underscores'
    );
  }
  
  return sanitized;
}

/**
 * Validate access token format (basic check)
 */
export function validateAccessToken(token: unknown): string {
  validateNonEmptyString(token, 'accessToken');
  
  const sanitized = token.trim();
  
  if (sanitized.length === 0) {
    throw new ValidationError('accessToken cannot be empty');
  }
  
  if (sanitized.length > 4096) {
    throw new ValidationError('accessToken is too long (max 4096 characters)');
  }
  
  return sanitized;
}
