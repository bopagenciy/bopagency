/**
 * Phase 4 Migration — Secure logger
 *
 * SECURITY: Sanitizes any field matching token|secret|key|password|access|
 * refresh|cookie|authorization before printing. Emails are masked.
 * Never logs raw file contents; never logs full paths in INFO level.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_FIELDS_RE = /token|secret|key|password|access|refresh|cookie|authorization/i;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const masked = local.slice(0, 2) + '***';
  const domainParts = domain.split('.');
  return `${masked}@***.${domainParts[domainParts.length - 1] ?? '***'}`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_FIELDS_RE.test(key)) return '[REDACTED]';
  if (typeof value === 'string' && EMAIL_RE.test(value)) return maskEmail(value);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return sanitizeObject(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeValue('', v));
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sanitizeValue(k, v);
  }
  return out;
}

export class Logger {
  private readonly verbose: boolean;

  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  private format(level: LogLevel, message: string, meta?: unknown): string {
    const ts = new Date().toISOString();
    if (meta !== undefined) {
      const safeMeta =
        typeof meta === 'object' && meta !== null && !Array.isArray(meta)
          ? sanitizeObject(meta as Record<string, unknown>)
          : meta;
      return `[${ts}] ${level.padEnd(5)} ${message} ${JSON.stringify(safeMeta)}`;
    }
    return `[${ts}] ${level.padEnd(5)} ${message}`;
  }

  debug(message: string, meta?: unknown): void {
    if (this.verbose) {
      process.stdout.write(this.format('DEBUG', message, meta) + '\n');
    }
  }

  info(message: string, meta?: unknown): void {
    process.stdout.write(this.format('INFO', message, meta) + '\n');
  }

  warn(message: string, meta?: unknown): void {
    process.stderr.write(this.format('WARN', message, meta) + '\n');
  }

  error(message: string, meta?: unknown): void {
    process.stderr.write(this.format('ERROR', message, meta) + '\n');
  }

  /** Log a MigrationAction result at appropriate level */
  action(
    action: string,
    entityType: string,
    sourceKey: string,
    extra?: Record<string, unknown>,
  ): void {
    const level: LogLevel =
      action === 'error'
        ? 'ERROR'
        : action === 'conflict' || action.startsWith('excluded')
          ? 'WARN'
          : 'DEBUG';
    const msg = `[${action.toUpperCase()}] ${entityType} ${sourceKey}`;
    if (level === 'ERROR') this.error(msg, extra);
    else if (level === 'WARN') this.warn(msg, extra);
    else this.debug(msg, extra);
  }
}
