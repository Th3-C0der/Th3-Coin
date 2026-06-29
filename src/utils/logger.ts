import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

export class Logger {
  private level: LogLevel;
  private logFile?: string;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: LogLevel = 'info', logFile?: string) {
    this.level = level;
    this.logFile = logFile;
    
    if (this.logFile) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * Set logging level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Set log file path
   */
  setLogFile(logFile: string): void {
    this.logFile = logFile;
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.level];
  }

  /**
   * Format log entry
   */
  private formatLogEntry(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = { timestamp, level, message, data };
    
    let formatted = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (data !== undefined) {
      formatted += ` ${JSON.stringify(data)}`;
    }
    
    return formatted;
  }

  /**
   * Write log entry to console and file
   */
  private writeLog(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formatted = this.formatLogEntry(level, message, data);
    
    // Console output with colors
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    
    console.log(`${colors[level]}${formatted}${reset}`);
    
    // File output
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, formatted + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    this.writeLog('debug', message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.writeLog('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.writeLog('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, data?: any): void {
    this.writeLog('error', message, data);
  }

  /**
   * Create child logger with prefix
   */
  child(prefix: string): Logger {
    const childLogger = new Logger(this.level, this.logFile);
    
    // Override methods to add prefix
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
    };

    childLogger.debug = (message: string, data?: any) => originalMethods.debug(`[${prefix}] ${message}`, data);
    childLogger.info = (message: string, data?: any) => originalMethods.info(`[${prefix}] ${message}`, data);
    childLogger.warn = (message: string, data?: any) => originalMethods.warn(`[${prefix}] ${message}`, data);
    childLogger.error = (message: string, data?: any) => originalMethods.error(`[${prefix}] ${message}`, data);

    return childLogger;
  }
}

// Global logger instance
export const logger = new Logger();