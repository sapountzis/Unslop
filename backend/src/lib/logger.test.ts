import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { logger } from './logger';

const stdoutWrite = process.stdout.write.bind(process.stdout);
const stderrWrite = process.stderr.write.bind(process.stderr);

describe('logger sanitization', () => {
  const stdoutSpy = mock((line: string) => {
    void line;
    return true;
  });
  const stderrSpy = mock((line: string) => {
    void line;
    return true;
  });

  beforeEach(() => {
    stdoutSpy.mockClear();
    stderrSpy.mockClear();
    process.stdout.write = stdoutSpy as typeof process.stdout.write;
    process.stderr.write = stderrSpy as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  });

  it('redacts sensitive keys including nested payloads', () => {
    logger.info('test_event', {
      authorization: 'Bearer raw-token',
      nested: {
        apiKey: 'secret-value',
        profile: {
          email: 'x@example.com',
          session_token: 'abc',
        },
      },
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const line = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(line);

    expect(parsed.authorization).toBe('[redacted]');
    expect(parsed.nested.apiKey).toBe('[redacted]');
    expect(parsed.nested.profile.session_token).toBe('[redacted]');
    expect(parsed.nested.profile.email).toBe('x@example.com');
  });

  it('logs errors to stderr with sanitized context', () => {
    logger.error('failure', new Error('boom'), {
      token: 'secret-token',
      request: { cookie: 'abc' },
    });

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const line = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(line);

    expect(parsed.token).toBe('[redacted]');
    expect(parsed.request.cookie).toBe('[redacted]');
    expect(parsed.error.message).toBe('boom');
  });
});
