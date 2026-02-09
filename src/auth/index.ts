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
  type SimpleTokenResolverConfig,
  JWTAuthProvider,
  type JWTAuthProviderConfig,
  type JWTPayload,
  JWTTokenResolver,
  type JWTTokenResolverConfig,
  APITokenResolver,
  type APITokenResolverConfig
} from './providers/index.js';
