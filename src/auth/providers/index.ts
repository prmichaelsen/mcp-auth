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
