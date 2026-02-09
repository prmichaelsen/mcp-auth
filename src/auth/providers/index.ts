/**
 * Authentication providers module exports
 */

// Environment-based provider
export {
  EnvAuthProvider,
  type EnvAuthProviderConfig
} from './env-provider.js';

// Simple token resolver
export {
  SimpleTokenResolver,
  type SimpleTokenResolverConfig
} from './simple-resolver.js';

// JWT provider and resolver
export {
  JWTAuthProvider,
  type JWTAuthProviderConfig,
  type JWTPayload
} from './jwt-provider.js';

export {
  JWTTokenResolver,
  type JWTTokenResolverConfig
} from './jwt-token-resolver.js';

// API-based token resolver
export {
  APITokenResolver,
  type APITokenResolverConfig
} from './api-token-resolver.js';
