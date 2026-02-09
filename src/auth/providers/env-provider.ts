/**
 * Environment variable authentication provider
 * 
 * Simple provider for single-user scenarios that reads credentials from environment variables.
 * Useful for local development and stdio mode.
 */

import { BaseAuthProvider } from '../base-provider.js';
import type { AuthProviderConfig } from '../types.js';
import type { RequestContext, AuthResult } from '../../types.js';
import { MissingCredentialsError } from '../../utils/errors.js';

/**
 * Configuration for EnvAuthProvider
 */
export interface EnvAuthProviderConfig extends AuthProviderConfig {
  /**
   * Environment variable name containing the user ID
   * @default 'MCP_USER_ID'
   */
  userIdEnvVar?: string;
  
  /**
   * Default user ID if environment variable is not set
   * @default 'default-user'
   */
  defaultUserId?: string;
  
  /**
   * Whether to require user ID environment variable
   * @default false
   */
  requireUserId?: boolean;
}

/**
 * Environment variable authentication provider
 * 
 * This provider is designed for single-user scenarios where authentication
 * is not required (e.g., local development, stdio mode).
 * 
 * It reads the user ID from an environment variable or uses a default value.
 * 
 * @example
 * ```typescript
 * const provider = new EnvAuthProvider({
 *   userIdEnvVar: 'MY_USER_ID',
 *   defaultUserId: 'local-user'
 * });
 * 
 * // Or with defaults
 * const provider = new EnvAuthProvider();
 * ```
 */
export class EnvAuthProvider extends BaseAuthProvider {
  private envConfig: Required<EnvAuthProviderConfig>;
  
  constructor(config: EnvAuthProviderConfig = {}) {
    super(config);
    
    this.envConfig = {
      ...config,
      userIdEnvVar: config.userIdEnvVar ?? 'MCP_USER_ID',
      defaultUserId: config.defaultUserId ?? 'default-user',
      requireUserId: config.requireUserId ?? false,
      errorMessages: config.errorMessages ?? {},
      cacheResults: config.cacheResults ?? false,
      cacheTtl: config.cacheTtl ?? 60000
    };
  }
  
  /**
   * Authenticate request by reading user ID from environment
   */
  protected async doAuthenticate(context: RequestContext): Promise<AuthResult> {
    // Read user ID from environment variable
    const userId = process.env[this.envConfig.userIdEnvVar];
    
    if (!userId) {
      if (this.envConfig.requireUserId) {
        return this.createFailureResult(
          `${this.envConfig.userIdEnvVar} environment variable is required`
        );
      }
      
      // Use default user ID
      this.logger.debug('Using default user ID', {
        defaultUserId: this.envConfig.defaultUserId
      });
      
      return this.createSuccessResult(this.envConfig.defaultUserId, {
        source: 'default'
      });
    }
    
    // Validate user ID
    if (userId.trim().length === 0) {
      return this.createFailureResult('User ID cannot be empty');
    }
    
    this.logger.debug('User ID resolved from environment', {
      envVar: this.envConfig.userIdEnvVar,
      userId
    });
    
    return this.createSuccessResult(userId, {
      source: 'environment',
      envVar: this.envConfig.userIdEnvVar
    });
  }
  
  /**
   * Validate provider configuration
   */
  async validate(): Promise<boolean> {
    if (this.envConfig.requireUserId) {
      const userId = process.env[this.envConfig.userIdEnvVar];
      if (!userId) {
        this.logger.error('Validation failed: Required environment variable not set', undefined, {
          envVar: this.envConfig.userIdEnvVar
        });
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get current user ID from environment
   */
  getUserId(): string {
    return process.env[this.envConfig.userIdEnvVar] ?? this.envConfig.defaultUserId;
  }
}
