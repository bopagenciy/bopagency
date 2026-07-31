import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../logger';

describe('Logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('logs INFO to stdout', () => {
    const logger = new Logger(false);
    logger.info('test message');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('test message'));
  });

  it('logs ERROR to stderr', () => {
    const logger = new Logger(false);
    logger.error('something failed');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
  });

  it('does NOT log DEBUG when verbose=false', () => {
    const logger = new Logger(false);
    logger.debug('debug message');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('logs DEBUG when verbose=true', () => {
    const logger = new Logger(true);
    logger.debug('debug message');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG'));
  });

  it('sanitizes sensitive field names in metadata', () => {
    const logger = new Logger(false);
    logger.info('test', { token: 'super-secret', name: 'safe' });
    const output = String((stdoutSpy.mock.calls[0] as unknown[])[0]);
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('super-secret');
    expect(output).toContain('safe');
  });

  it('masks email addresses in metadata', () => {
    const logger = new Logger(false);
    logger.info('test', { contact: 'francisco@example.com' });
    const output = String((stdoutSpy.mock.calls[0] as unknown[])[0]);
    expect(output).not.toContain('francisco@example.com');
    expect(output).toContain('fr***');
  });

  it('does not modify non-sensitive string fields', () => {
    const logger = new Logger(false);
    logger.info('test', { slug: 'legalink-col', status: 'active' });
    const output = String((stdoutSpy.mock.calls[0] as unknown[])[0]);
    expect(output).toContain('legalink-col');
    expect(output).toContain('active');
  });
});
