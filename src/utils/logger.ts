// Logging Utility
// Purpose: Structured logging for debugging, monitoring, and auditing

import config from '../config/env';

// Log levels in order of severity
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Log entry structure
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, any>;
}

/**
 * Format a log entry as JSON string
 * JSON format is easier to parse by log aggregators
 */
function formatLog(level: LogLevel, message: string, data?: Record<string, any>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  return JSON.stringify(entry);
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
  /**
   * Debug level - development only
   * Use for detailed debugging information
   */
  debug(message: string, data?: Record<string, any>): void {
    if (config.NODE_ENV === 'development') {
      console.log(formatLog('debug', message, data));
    }
  },

  /**
   * Info level - normal operations
   * Use for tracking normal system behavior
   */
  info(message: string, data?: Record<string, any>): void {
    console.log(formatLog('info', message, data));
  },

  /**
   * Warn level - potential issues
   * Use for non-critical issues that should be investigated
   */
  warn(message: string, data?: Record<string, any>): void {
    console.warn(formatLog('warn', message, data));
  },

  /**
   * Error level - failures
   * Use for errors that need immediate attention
   */
  error(message: string, data?: Record<string, any>): void {
    console.error(formatLog('error', message, data));
  },

  /**
   * Log HTTP request (for middleware)
   */
  request(method: string, path: string, statusCode: number, duration: number, userId?: string): void {
    this.info('HTTP Request', {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      ...(userId && { userId }),
    });
  },

  /**
   * Log authentication events
   */
  auth(event: 'login' | 'logout' | 'register' | 'signup' | 'failed_login' | 'device_bind', userId?: string, details?: Record<string, any>): void {
    this.info(`Auth: ${event}`, {
      event,
      ...(userId && { userId }),
      ...details,
    });
  },

  /**
   * Log attendance events
   */
  attendance(event: 'check_in' | 'check_out' | 'geo_rejected', userId: string, details?: Record<string, any>): void {
    this.info(`Attendance: ${event}`, {
      event,
      userId,
      ...details,
    });
  },
};

export default logger;
