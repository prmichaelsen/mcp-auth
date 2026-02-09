/**
 * Logging utility for @prmichaelsen/mcp-auth
 * 
 * Provides structured logging with different levels and formats.
 */

import type { LoggingConfig } from '../types.js';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private config: LoggingConfig;
  private minLevel: LogLevel;
  
  constructor(config: Partial<LoggingConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      level: config.level ?? 'info',
      format: config.format ?? 'text',
      logBodies: config.logBodies ?? false
    };
    
    this.minLevel = this.getLevelValue(this.config.level);
  }
  
  /**
   * Convert log level string to numeric value
   */
  private getLevelValue(level: string): LogLevel {
    switch (level) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }
  
  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.config.enabled && level >= this.minLevel;
  }
  
  /**
   * Format log entry
   */
  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }
    
    // Text format
    let output = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n${entry.error.stack}`;
      }
    }
    
    return output;
  }
  
  /**
   * Create log entry
   */
  private createEntry(
    level: string,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    return entry;
  }
  
  /**
   * Write log entry to output
   */
  private write(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);
    
    // Use appropriate console method based on level
    switch (entry.level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
      default:
        console.log(formatted);
    }
  }
  
  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createEntry('debug', message, context);
      this.write(entry);
    }
  }
  
  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createEntry('info', message, context);
      this.write(entry);
    }
  }
  
  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createEntry('warn', message, context);
      this.write(entry);
    }
  }
  
  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createEntry('error', message, context, error);
      this.write(entry);
    }
  }
  
  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.config);
    
    // Override write to include parent context
    const originalWrite = childLogger.write.bind(childLogger);
    childLogger.write = (entry: LogEntry) => {
      entry.context = { ...context, ...entry.context };
      originalWrite(entry);
    };
    
    return childLogger;
  }
  
  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config };
    this.minLevel = this.getLevelValue(this.config.level);
  }
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger();

/**
 * Create a new logger instance
 */
export function createLogger(config?: Partial<LoggingConfig>): Logger {
  return new Logger(config);
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitizeForLogging(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie'
  ];
  
  const sanitized: any = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}
