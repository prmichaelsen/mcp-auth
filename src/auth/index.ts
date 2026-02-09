/**
 * Authentication module exports
 */

// Types
export type {
  AuthProvider,
  ResourceTokenResolver,
  AuthenticatedContext,
  AuthProviderConfig,
  TokenResolverConfig
} from './types.js';

// Base provider
export { BaseAuthProvider } from './base-provider.js';

// Providers
export {
  EnvAuthProvider,
  type EnvAuthProviderConfig,
  SimpleTokenResolver,
  type SimpleTokenResolverConfig
} from './providers/index.js';
