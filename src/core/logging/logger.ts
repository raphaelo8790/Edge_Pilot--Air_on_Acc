/**
 * Structured Logger
 * 
 * Provides structured logging for EdgePilot AI.
 * Replaces console.log with proper logging levels.
 * 
 * @module src/core/logging/logger
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry;
    let formatted = `[${timestamp}] ${level}: ${message}`;
    
    if (context) {
      formatted += ` | ${JSON.stringify(context)}`;
    }
    
    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (this.isDevelopment && error.stack) {
        formatted += `\n${error.stack}`;
      }
    }
    
    return formatted;
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (!this.isDevelopment) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
    };
    
    console.debug(this.formatEntry(entry));
  }

  info(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
    };
    
    console.info(this.formatEntry(entry));
  }

  warn(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context,
    };
    
    console.warn(this.formatEntry(entry));
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context,
      error,
    };
    
    console.error(this.formatEntry(entry));
  }
}

export const logger = new Logger();
