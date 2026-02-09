/**
 * Tenant Manager Integration Module
 * 
 * Provides interfaces and utilities for tenant managers to integrate with MCP servers.
 */

export type {
  TenantAPIErrorResponse,
  CredentialsAPIResponse,
  CredentialsAPIHeaders,
  TenantManagerAPI
} from './api-contracts.js';

export {
  TenantAPIStatusCode,
  TenantAPIErrorCode,
  createTenantAPIError,
  TenantAPIErrors
} from './api-contracts.js';
