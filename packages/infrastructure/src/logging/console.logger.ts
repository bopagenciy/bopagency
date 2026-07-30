import type { LoggerPort, LogLevel, LogContext } from '@bop-agency/application';

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context !== undefined ? { context } : {}),
    ...(error !== undefined
      ? { error: error instanceof Error ? error.message : String(error) }
      : {}),
  };
  // eslint-disable-next-line no-console
  console[
    level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error'
  ](JSON.stringify(entry));
}

export const consoleLogger: LoggerPort = {
  debug: (message, context) => log('debug', message, context),
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, error, context) => log('error', message, context, error),
};
